import { prisma } from "../lib/prisma.js";
import { appError } from "../lib/errors.js";
import { sendBulkEmail } from "../lib/mailer.js";
import { isCuidLike, sanitizeText } from "../lib/validation.js";
import { writeActivity, writeAuditLog } from "../lib/audit.js";
import { assertUsageLimit, trackUsage } from "../lib/usage.js";
import { getTemplate, listSequenceTemplates } from "../lib/sequences.js";

function renderTemplate(template, data) {
  return String(template || "").replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const cleaned = String(key || "").trim();
    return String(data[cleaned] || "there");
  });
}

export async function listCampaigns(req, res, next) {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: req.user.id },
      orderBy: { id: "desc" }
    });
    return res.json(campaigns);
  } catch (error) {
    return next(error);
  }
}

export async function listTemplates(req, res, next) {
  try {
    return res.json(listSequenceTemplates());
  } catch (error) {
    return next(error);
  }
}

export async function launchQuickCampaign(req, res, next) {
  try {
    const niche = sanitizeText(req.body.niche, 40).toLowerCase();
    const offer = sanitizeText(req.body.offer, 120);
    const templateId = sanitizeText(req.body.templateId, 80);

    if (!niche || !offer) {
      return next(appError(400, "Niche and offer are required", "CAMPAIGN_QUICK_LAUNCH_INVALID"));
    }

    const template = getTemplate(niche, templateId);
    if (!template) {
      return next(appError(400, "No template available for selected niche", "CAMPAIGN_TEMPLATE_NOT_FOUND"));
    }

    const sender = req.user.email.split("@")[0] || "Leadflow";
    const campaign = await prisma.campaign.create({
      data: {
        userId: req.user.id,
        name: `${niche.replace(/_/g, " ")} quick launch`,
        subject: renderTemplate(template.subject, { offer, sender, company: "your business", niche }),
        body: renderTemplate(template.body, { offer, sender, niche, name: "there" })
      }
    });

    await writeAuditLog({ userId: req.user.id, action: "campaign.quick_launch", resource: campaign.id, metadata: { niche, offer } });
    return res.status(201).json(campaign);
  } catch (error) {
    return next(error);
  }
}

export async function createCampaign(req, res, next) {
  try {
    const name = sanitizeText(req.body.name, 140);
    const subject = sanitizeText(req.body.subject, 200);
    const body = sanitizeText(req.body.body, 20000);
    if (!name || !subject || !body) {
      return next(appError(400, "Name, subject, and body are required", "CAMPAIGN_VALIDATION_ERROR"));
    }

    if (name.length > 140 || subject.length > 200 || body.length > 20000) {
      return next(appError(400, "Campaign payload exceeds allowed size", "CAMPAIGN_VALIDATION_ERROR"));
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId: req.user.id,
        name,
        subject,
        body
      }
    });

    await writeAuditLog({ userId: req.user.id, action: "campaign.create", resource: campaign.id });
    return res.status(201).json(campaign);
  } catch (error) {
    return next(error);
  }
}

export async function sendCampaign(req, res, next) {
  try {
    const { id } = req.params;
    if (!isCuidLike(id)) {
      return next(appError(400, "Invalid campaign id", "CAMPAIGN_INVALID_ID"));
    }

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign || campaign.userId !== req.user.id) {
      return next(appError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND"));
    }

    const leads = await prisma.lead.findMany({
      where: { userId: req.user.id },
      select: { id: true, email: true, status: true }
    });

    if (leads.length === 0) {
      return next(appError(400, "No leads available for sending", "CAMPAIGN_NO_LEADS"));
    }

    const consent = await prisma.consentRecord.findMany({
      where: { userId: req.user.id, unsubscribed: true },
      select: { email: true }
    });
    const blocked = new Set(consent.map((item) => item.email));
    const recipients = leads
      .filter((lead) => !["REPLIED", "CLIENT"].includes(String(lead.status || "").toUpperCase()))
      .map((lead) => lead.email)
      .filter((email) => !blocked.has(email));

    if (recipients.length === 0) {
      return next(appError(400, "No eligible recipients available", "CAMPAIGN_NO_RECIPIENTS"));
    }

    await assertUsageLimit(req.user, "emails", recipients.length);

    const result = await sendBulkEmail({
      recipients,
      subject: campaign.subject,
      html: campaign.body
    });

    const followUpAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          sentCount: { increment: result.sent }
        }
      }),
      prisma.lead.updateMany({
        where: {
          userId: req.user.id,
          email: { in: recipients },
          status: { notIn: ["REPLIED", "CLIENT"] }
        },
        data: { followUpAt }
      }),
      prisma.userStats.upsert({
        where: { userId: req.user.id },
        update: { campaignsSent: { increment: 1 } },
        create: { userId: req.user.id, campaignsSent: 1 }
      })
    ]);

    await trackUsage(req.user.id, { emails: result.sent });
    await writeActivity({
      userId: req.user.id,
      campaignId: campaign.id,
      type: "campaign.sent",
      message: `Campaign ${campaign.name} sent to ${result.sent} recipients`,
      metadata: { failed: result.failed, followUpAt: followUpAt.toISOString() }
    });
    await writeAuditLog({ userId: req.user.id, action: "campaign.send", resource: campaign.id, metadata: result });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
