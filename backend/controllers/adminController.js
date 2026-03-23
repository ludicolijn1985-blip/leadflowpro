import { prisma } from "../lib/prisma.js";
import { appError } from "../lib/errors.js";
import { sanitizeText } from "../lib/validation.js";

export async function adminUsers(req, res, next) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        teamRole: true,
        createdAt: true,
        trialEnd: true
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return res.json(users);
  } catch (error) {
    return next(error);
  }
}

export async function adminLogs(req, res, next) {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200
    });
    return res.json(logs);
  } catch (error) {
    return next(error);
  }
}

export async function adminSystemStatus(req, res, next) {
  try {
    const [userCount, leadCount, campaignCount] = await Promise.all([
      prisma.user.count(),
      prisma.lead.count(),
      prisma.campaign.count()
    ]);

    return res.json({
      users: userCount,
      leads: leadCount,
      campaigns: campaignCount,
      uptimeSeconds: Math.floor(process.uptime())
    });
  } catch (error) {
    return next(error);
  }
}

export async function listFeatureFlags(req, res, next) {
  try {
    const flags = await prisma.featureFlag.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" }
    });
    return res.json(flags);
  } catch (error) {
    return next(error);
  }
}

export async function upsertFeatureFlag(req, res, next) {
  try {
    const key = sanitizeText(req.body.key, 80);
    const enabled = Boolean(req.body.enabled);
    if (!key) {
      return next(appError(400, "Feature flag key is required", "ADMIN_FLAG_VALIDATION_ERROR"));
    }

    const existing = await prisma.featureFlag.findFirst({
      where: { userId: req.user.id, key }
    });

    if (!existing) {
      const created = await prisma.featureFlag.create({
        data: { userId: req.user.id, key, enabled }
      });
      return res.status(201).json(created);
    }

    const updated = await prisma.featureFlag.update({
      where: { id: existing.id },
      data: { enabled }
    });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
}
