import { prisma } from "../lib/prisma.js";
import { appError } from "../lib/errors.js";
import { calculateLeadScore } from "../lib/scoring.js";
import { isCuidLike, sanitizeJsonObject, sanitizeText } from "../lib/validation.js";
import { writeActivity, writeAuditLog } from "../lib/audit.js";

export async function listStages(req, res, next) {
  try {
    const stages = await prisma.pipelineStage.findMany({
      where: { userId: req.user.id },
      orderBy: { sortOrder: "asc" }
    });
    return res.json(stages);
  } catch (error) {
    return next(error);
  }
}

export async function createStage(req, res, next) {
  try {
    const name = sanitizeText(req.body.name, 80);
    const color = sanitizeText(req.body.color, 20) || "#06b6d4";
    const sortOrder = Number(req.body.sortOrder);
    if (!name || !Number.isInteger(sortOrder) || sortOrder < 1) {
      return next(appError(400, "Stage name and sort order are required", "CRM_STAGE_VALIDATION"));
    }

    const stage = await prisma.pipelineStage.create({
      data: {
        userId: req.user.id,
        name,
        color,
        sortOrder
      }
    });

    await writeAuditLog({ userId: req.user.id, action: "stage.create", resource: stage.id });
    return res.status(201).json(stage);
  } catch (error) {
    return next(error);
  }
}

export async function moveLeadStage(req, res, next) {
  try {
    const leadId = req.params.id;
    const stageId = sanitizeText(req.body.stageId, 40);

    if (!isCuidLike(leadId) || !isCuidLike(stageId)) {
      return next(appError(400, "Invalid lead or stage id", "CRM_MOVE_INVALID_ID"));
    }

    const [lead, stage, timelineCount] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId } }),
      prisma.pipelineStage.findUnique({ where: { id: stageId } }),
      prisma.timelineEvent.count({ where: { leadId } })
    ]);

    if (!lead || lead.userId !== req.user.id) {
      return next(appError(404, "Lead not found", "CRM_LEAD_NOT_FOUND"));
    }

    if (!stage || stage.userId !== req.user.id) {
      return next(appError(404, "Stage not found", "CRM_STAGE_NOT_FOUND"));
    }

    const score = calculateLeadScore({
      status: lead.status,
      customFields: lead.customFields || {},
      timelineCount
    });

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        stageId,
        score
      },
      include: { stage: true }
    });

    await prisma.timelineEvent.create({
      data: {
        userId: req.user.id,
        leadId,
        type: "ACTIVITY",
        content: `Moved to stage ${stage.name}`,
        metadata: { from: lead.stageId, to: stageId }
      }
    });
    await writeActivity({
      userId: req.user.id,
      type: "lead.stage.moved",
      message: `${lead.name} moved to ${stage.name}`,
      leadId
    });

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
}

export async function listOpportunities(req, res, next) {
  try {
    const opportunities = await prisma.opportunity.findMany({
      where: { userId: req.user.id },
      include: { lead: true, stage: true },
      orderBy: { createdAt: "desc" }
    });

    return res.json(opportunities);
  } catch (error) {
    return next(error);
  }
}

export async function createOpportunity(req, res, next) {
  try {
    const name = sanitizeText(req.body.name, 120);
    const amount = Number(req.body.amount || 0);
    const leadId = sanitizeText(req.body.leadId, 40) || null;
    const stageId = sanitizeText(req.body.stageId, 40) || null;

    if (!name) {
      return next(appError(400, "Opportunity name is required", "CRM_OPPORTUNITY_VALIDATION"));
    }

    if (leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead || lead.userId !== req.user.id) {
        return next(appError(400, "Invalid lead for opportunity", "CRM_OPPORTUNITY_LEAD_INVALID"));
      }
    }

    if (stageId) {
      const stage = await prisma.pipelineStage.findUnique({ where: { id: stageId } });
      if (!stage || stage.userId !== req.user.id) {
        return next(appError(400, "Invalid stage for opportunity", "CRM_OPPORTUNITY_STAGE_INVALID"));
      }
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        userId: req.user.id,
        leadId,
        stageId,
        name,
        amount: Number.isFinite(amount) ? amount : 0
      }
    });

    await writeAuditLog({ userId: req.user.id, action: "opportunity.create", resource: opportunity.id });
    return res.status(201).json(opportunity);
  } catch (error) {
    return next(error);
  }
}

export async function listTimeline(req, res, next) {
  try {
    const leadId = req.params.id;
    if (!isCuidLike(leadId)) {
      return next(appError(400, "Invalid lead id", "CRM_TIMELINE_INVALID_ID"));
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.userId !== req.user.id) {
      return next(appError(404, "Lead not found", "CRM_LEAD_NOT_FOUND"));
    }

    const events = await prisma.timelineEvent.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" }
    });
    return res.json(events);
  } catch (error) {
    return next(error);
  }
}

export async function addTimelineEvent(req, res, next) {
  try {
    const leadId = req.params.id;
    const type = sanitizeText(req.body.type, 20).toUpperCase();
    const content = sanitizeText(req.body.content, 4000);
    const metadata = sanitizeJsonObject(req.body.metadata);

    if (!isCuidLike(leadId)) {
      return next(appError(400, "Invalid lead id", "CRM_TIMELINE_INVALID_ID"));
    }

    if (!["EMAIL", "NOTE", "ACTIVITY"].includes(type) || !content) {
      return next(appError(400, "Invalid timeline event payload", "CRM_TIMELINE_VALIDATION"));
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.userId !== req.user.id) {
      return next(appError(404, "Lead not found", "CRM_LEAD_NOT_FOUND"));
    }

    const event = await prisma.timelineEvent.create({
      data: {
        userId: req.user.id,
        leadId,
        type,
        content,
        metadata
      }
    });

    return res.status(201).json(event);
  } catch (error) {
    return next(error);
  }
}

export async function listSegments(req, res, next) {
  try {
    const segments = await prisma.savedSegment.findMany({
      where: { userId: req.user.id },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "desc" }
    });
    return res.json(segments);
  } catch (error) {
    return next(error);
  }
}

function matchesFilter(lead, filters) {
  if (filters.status && String(lead.status || "").toUpperCase() !== String(filters.status).toUpperCase()) {
    return false;
  }
  if (filters.stageId && lead.stageId !== filters.stageId) {
    return false;
  }
  if (filters.minScore && Number(lead.score || 0) < Number(filters.minScore)) {
    return false;
  }
  return true;
}

export async function createSegment(req, res, next) {
  try {
    const name = sanitizeText(req.body.name, 100);
    const filters = sanitizeJsonObject(req.body.filters);
    if (!name) {
      return next(appError(400, "Segment name is required", "CRM_SEGMENT_VALIDATION"));
    }

    const [segment, leads] = await Promise.all([
      prisma.savedSegment.create({
        data: {
          userId: req.user.id,
          name,
          filters
        }
      }),
      prisma.lead.findMany({ where: { userId: req.user.id } })
    ]);

    const matched = leads.filter((lead) => matchesFilter(lead, filters));
    if (matched.length > 0) {
      await prisma.segmentLead.createMany({
        data: matched.map((lead) => ({ segmentId: segment.id, leadId: lead.id }))
      });
    }

    return res.status(201).json({ ...segment, matched: matched.length });
  } catch (error) {
    return next(error);
  }
}

export async function duplicateCandidates(req, res, next) {
  try {
    const leads = await prisma.lead.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" }
    });

    const grouped = new Map();
    for (const lead of leads) {
      const key = String(lead.email || "").toLowerCase();
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(lead);
    }

    const duplicates = [];
    for (const [email, items] of grouped.entries()) {
      if (items.length > 1) {
        duplicates.push({ email, items });
      }
    }

    return res.json(duplicates);
  } catch (error) {
    return next(error);
  }
}

export async function mergeLeads(req, res, next) {
  try {
    const sourceId = sanitizeText(req.body.sourceId, 40);
    const targetId = sanitizeText(req.body.targetId, 40);
    if (!isCuidLike(sourceId) || !isCuidLike(targetId) || sourceId === targetId) {
      return next(appError(400, "Invalid source/target id", "CRM_MERGE_INVALID_ID"));
    }

    const [source, target] = await Promise.all([
      prisma.lead.findUnique({ where: { id: sourceId } }),
      prisma.lead.findUnique({ where: { id: targetId } })
    ]);

    if (!source || !target || source.userId !== req.user.id || target.userId !== req.user.id) {
      return next(appError(404, "Lead not found", "CRM_LEAD_NOT_FOUND"));
    }

    await prisma.$transaction([
      prisma.timelineEvent.updateMany({ where: { leadId: source.id }, data: { leadId: target.id } }),
      prisma.task.updateMany({ where: { leadId: source.id }, data: { leadId: target.id } }),
      prisma.opportunity.updateMany({ where: { leadId: source.id }, data: { leadId: target.id } }),
      prisma.lead.update({
        where: { id: target.id },
        data: {
          customFields: {
            ...(target.customFields || {}),
            ...(source.customFields || {})
          },
          score: Math.max(target.score || 0, source.score || 0)
        }
      }),
      prisma.lead.delete({ where: { id: source.id } })
    ]);

    await writeAuditLog({ userId: req.user.id, action: "lead.merge", resource: target.id, metadata: { sourceId } });
    return res.json({ merged: true, targetId: target.id, sourceId: source.id });
  } catch (error) {
    return next(error);
  }
}
