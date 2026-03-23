import { prisma } from "../lib/prisma.js";
import { appError } from "../lib/errors.js";
import { isCuidLike, isValidEmail, sanitizeEmail, sanitizeJsonObject, sanitizeText } from "../lib/validation.js";
import { calculateLeadScore } from "../lib/scoring.js";
import { writeActivity, writeAuditLog } from "../lib/audit.js";
import { buildLeadSuggestions } from "../lib/sequences.js";

function createDuplicateKey(email) {
  return String(email || "").toLowerCase();
}

async function assertLeadLimit(userId, role, incoming = 1) {
  if (role === "PRO") {
    return;
  }

  const current = await prisma.lead.count({ where: { userId, isDemo: false } });
  if (current + incoming > 5) {
    throw appError(403, "Free plan limit reached (5 leads)", "LEADS_LIMIT_REACHED");
  }
}

export async function listLeads(req, res, next) {
  try {
    const leads = await prisma.lead.findMany({
      where: { userId: req.user.id },
      include: { stage: true },
      orderBy: { id: "desc" }
    });
    return res.json(leads);
  } catch (error) {
    return next(error);
  }
}

export async function getLeadFeed(req, res, next) {
  try {
    const niche = sanitizeText(req.query.niche, 40) || "agencies";
    const offer = sanitizeText(req.query.offer, 120) || "client acquisition";
    const suggestions = buildLeadSuggestions(niche, offer);
    return res.json({ niche, offer, suggestions });
  } catch (error) {
    return next(error);
  }
}

export async function createLead(req, res, next) {
  try {
    const name = sanitizeText(req.body.name, 120);
    const email = sanitizeEmail(req.body.email);
    const status = sanitizeText(req.body.status || "NEW", 60);
    const customFields = sanitizeJsonObject(req.body.customFields);
    const stageId = sanitizeText(req.body.stageId, 40) || null;
    if (!name || !email) {
      return next(appError(400, "Name and email are required", "LEADS_VALIDATION_ERROR"));
    }

    if (!isValidEmail(email)) {
      return next(appError(400, "Invalid email format", "LEADS_INVALID_EMAIL"));
    }

    if (!status) {
      return next(appError(400, "Lead status is required", "LEADS_VALIDATION_ERROR"));
    }

    if (name.length > 120 || status.length > 60) {
      return next(appError(400, "Lead payload exceeds allowed size", "LEADS_VALIDATION_ERROR"));
    }

    await assertLeadLimit(req.user.id, req.user.role, 1);

    if (stageId) {
      const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
      if (!stage || stage.userId !== req.user.id) {
        return next(appError(400, "Invalid pipeline stage", "LEADS_INVALID_STAGE"));
      }
    }

    const score = calculateLeadScore({ status, customFields, timelineCount: 0 });

    const lead = await prisma.lead.create({
      data: {
        userId: req.user.id,
        name,
        email,
        status,
        score,
        stageId,
        customFields,
        duplicateKey: createDuplicateKey(email),
        isDemo: false
      }
    });

    await writeActivity({ userId: req.user.id, type: "lead.created", message: `Lead ${name} created`, leadId: lead.id });
    await writeAuditLog({ userId: req.user.id, action: "lead.create", resource: lead.id });

    return res.status(201).json(lead);
  } catch (error) {
    return next(error);
  }
}

export async function updateLead(req, res, next) {
  try {
    const { id } = req.params;
    if (!isCuidLike(id)) {
      return next(appError(400, "Invalid lead id", "LEADS_INVALID_ID"));
    }

    const lead = await prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.userId !== req.user.id) {
      return next(appError(404, "Lead not found", "LEADS_NOT_FOUND"));
    }

    const nextName = req.body.name === undefined ? lead.name : sanitizeText(req.body.name, 120);
    const nextEmail = req.body.email === undefined ? lead.email : sanitizeEmail(req.body.email);
    const nextStatus = req.body.status === undefined ? lead.status : sanitizeText(req.body.status, 60);
    const nextCustomFields = req.body.customFields === undefined ? lead.customFields : sanitizeJsonObject(req.body.customFields);
    const nextStageId = req.body.stageId === undefined ? lead.stageId : sanitizeText(req.body.stageId, 40);
    const previousStatus = String(lead.status || "").toUpperCase();

    if (!nextName || !nextEmail || !nextStatus) {
      return next(appError(400, "Name, email, and status cannot be empty", "LEADS_VALIDATION_ERROR"));
    }

    if (!isValidEmail(nextEmail)) {
      return next(appError(400, "Invalid email format", "LEADS_INVALID_EMAIL"));
    }

    if (nextName.length > 120 || nextStatus.length > 60) {
      return next(appError(400, "Lead payload exceeds allowed size", "LEADS_VALIDATION_ERROR"));
    }

    if (nextStageId) {
      const stage = await prisma.pipelineStage.findUnique({ where: { id: nextStageId } });
      if (!stage || stage.userId !== req.user.id) {
        return next(appError(400, "Invalid pipeline stage", "LEADS_INVALID_STAGE"));
      }
    }

    const timelineCount = await prisma.timelineEvent.count({ where: { leadId: id } });
    const score = calculateLeadScore({ status: nextStatus, customFields: nextCustomFields, timelineCount });

    const updated = await prisma.lead.update({
      where: { id },
      data: {
        name: nextName,
        email: nextEmail,
        status: nextStatus,
        score,
        customFields: nextCustomFields,
        stageId: nextStageId || null,
        duplicateKey: createDuplicateKey(nextEmail),
        repliedAt: String(nextStatus).toUpperCase() === "REPLIED" ? new Date() : lead.repliedAt,
        followUpAt: String(nextStatus).toUpperCase() === "REPLIED" ? null : lead.followUpAt
      }
    });

    const normalizedNext = String(nextStatus).toUpperCase();
    const updates = [];
    if (normalizedNext === "REPLIED" && previousStatus !== "REPLIED") {
      updates.push(
        prisma.userStats.upsert({
          where: { userId: req.user.id },
          update: { replies: { increment: 1 }, conversations: { increment: 1 } },
          create: { userId: req.user.id, replies: 1, conversations: 1 }
        }),
        prisma.milestone.updateMany({
          where: { userId: req.user.id, firstReplyAt: null },
          data: { firstReplyAt: new Date() }
        })
      );
    }

    if ((normalizedNext === "MEETING" || normalizedNext === "BOOKED") && previousStatus !== normalizedNext) {
      updates.push(
        prisma.milestone.updateMany({
          where: { userId: req.user.id, firstMeetingAt: null },
          data: { firstMeetingAt: new Date() }
        })
      );
    }

    if (normalizedNext === "CLIENT" && previousStatus !== "CLIENT") {
      updates.push(
        prisma.userStats.upsert({
          where: { userId: req.user.id },
          update: { clients: { increment: 1 } },
          create: { userId: req.user.id, clients: 1 }
        }),
        prisma.milestone.updateMany({
          where: { userId: req.user.id, firstClientAt: null },
          data: { firstClientAt: new Date() }
        })
      );
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    await writeActivity({ userId: req.user.id, type: "lead.updated", message: `Lead ${updated.name} updated`, leadId: updated.id });
    await writeAuditLog({ userId: req.user.id, action: "lead.update", resource: updated.id });

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
}

export async function deleteLead(req, res, next) {
  try {
    const { id } = req.params;
    if (!isCuidLike(id)) {
      return next(appError(400, "Invalid lead id", "LEADS_INVALID_ID"));
    }

    const lead = await prisma.lead.findUnique({ where: { id } });

    if (!lead || lead.userId !== req.user.id) {
      return next(appError(404, "Lead not found", "LEADS_NOT_FOUND"));
    }

    await prisma.lead.delete({ where: { id } });
    await writeActivity({ userId: req.user.id, type: "lead.deleted", message: `Lead ${lead.name} deleted`, leadId: id });
    await writeAuditLog({ userId: req.user.id, action: "lead.delete", resource: id });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

export async function canAddLeads(userId, role, incoming) {
  if (!Number.isInteger(incoming) || incoming <= 0) {
    throw appError(400, "Invalid lead import size", "LEADS_INVALID_IMPORT_SIZE");
  }

  await assertLeadLimit(userId, role, incoming);
}

export async function createLeadsFromFeed(req, res, next) {
  try {
    const niche = sanitizeText(req.body.niche, 40) || "agencies";
    const offer = sanitizeText(req.body.offer, 120) || "client acquisition";
    const suggestions = buildLeadSuggestions(niche, offer).slice(0, 5);

    await canAddLeads(req.user.id, req.user.role, suggestions.length);
    await prisma.lead.createMany({
      data: suggestions.map((lead) => ({
        userId: req.user.id,
        name: lead.name,
        email: lead.email,
        status: lead.status,
        customFields: lead.customFields,
        duplicateKey: createDuplicateKey(lead.email),
        isDemo: false
      }))
    });

    await prisma.userStats.upsert({
      where: { userId: req.user.id },
      update: { leadsImported: { increment: suggestions.length } },
      create: { userId: req.user.id, leadsImported: suggestions.length }
    });

    return res.status(201).json({ imported: suggestions.length, niche, offer });
  } catch (error) {
    return next(error);
  }
}