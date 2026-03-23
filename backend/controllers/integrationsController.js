import { prisma } from "../lib/prisma.js";
import { appError } from "../lib/errors.js";
import { isValidUrl, sanitizeJsonObject, sanitizeText } from "../lib/validation.js";

const SUPPORTED = new Set(["google_sheets", "slack", "webhook_connector"]);

export async function listIntegrations(req, res, next) {
  try {
    const connections = await prisma.integrationConnection.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" }
    });
    return res.json(connections);
  } catch (error) {
    return next(error);
  }
}

export async function upsertIntegration(req, res, next) {
  try {
    const provider = sanitizeText(req.body.provider, 40).toLowerCase();
    const settings = sanitizeJsonObject(req.body.config);

    if (!SUPPORTED.has(provider)) {
      return next(appError(400, "Unsupported integration provider", "INTEGRATION_INVALID_PROVIDER"));
    }

    if (provider === "slack" && settings.webhookUrl && !isValidUrl(settings.webhookUrl)) {
      return next(appError(400, "Invalid Slack webhook URL", "INTEGRATION_INVALID_CONFIG"));
    }

    const existing = await prisma.integrationConnection.findFirst({
      where: { userId: req.user.id, provider }
    });

    if (!existing) {
      const created = await prisma.integrationConnection.create({
        data: {
          userId: req.user.id,
          provider,
          config: settings,
          enabled: true
        }
      });
      return res.status(201).json(created);
    }

    const updated = await prisma.integrationConnection.update({
      where: { id: existing.id },
      data: { config: settings, enabled: true }
    });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
}

export async function exportLeadsForSheets(req, res, next) {
  try {
    const leads = await prisma.lead.findMany({
      where: { userId: req.user.id },
      select: {
        name: true,
        email: true,
        status: true,
        score: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ rows: leads });
  } catch (error) {
    return next(error);
  }
}
