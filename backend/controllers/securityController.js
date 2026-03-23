import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { appError } from "../lib/errors.js";
import { isCuidLike, sanitizeEmail, sanitizeText } from "../lib/validation.js";
import { writeAuditLog } from "../lib/audit.js";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

export async function enableTwoFactor(req, res, next) {
  try {
    const secret = randomToken();
    const challenge = secret.slice(0, 6);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false
      }
    });

    return res.json({ secret, challenge });
  } catch (error) {
    return next(error);
  }
}

export async function verifyTwoFactor(req, res, next) {
  try {
    const otp = sanitizeText(req.body.otp, 10);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.twoFactorSecret) {
      return next(appError(400, "No 2FA enrollment in progress", "SECURITY_2FA_NOT_SETUP"));
    }

    if (otp !== user.twoFactorSecret.slice(0, 6)) {
      return next(appError(400, "Invalid verification code", "SECURITY_2FA_INVALID"));
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { twoFactorEnabled: true }
    });

    await writeAuditLog({ userId: req.user.id, action: "security.2fa.enabled", resource: "user" });
    return res.json({ enabled: true });
  } catch (error) {
    return next(error);
  }
}

export async function listSessions(req, res, next) {
  try {
    const sessions = await prisma.userSession.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" }
    });
    return res.json(sessions);
  } catch (error) {
    return next(error);
  }
}

export async function revokeSession(req, res, next) {
  try {
    const id = req.params.id;
    if (!isCuidLike(id)) {
      return next(appError(400, "Invalid session id", "SECURITY_SESSION_INVALID_ID"));
    }

    const session = await prisma.userSession.findUnique({ where: { id } });
    if (!session || session.userId !== req.user.id) {
      return next(appError(404, "Session not found", "SECURITY_SESSION_NOT_FOUND"));
    }

    await prisma.userSession.update({ where: { id }, data: { revokedAt: new Date() } });
    return res.json({ revoked: true });
  } catch (error) {
    return next(error);
  }
}

export async function requestMagicLink(req, res, next) {
  try {
    const email = sanitizeEmail(req.body.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.json({ sent: true });
    }

    const token = randomToken();
    await prisma.magicLinkToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      }
    });

    return res.json({ sent: true, token });
  } catch (error) {
    return next(error);
  }
}

export async function consumeMagicLink(req, res, next) {
  try {
    const token = sanitizeText(req.body.token, 100);
    const tokenHash = sha256(token);

    const magic = await prisma.magicLinkToken.findUnique({ where: { tokenHash } });
    if (!magic || magic.consumedAt || magic.expiresAt < new Date()) {
      return next(appError(400, "Magic link is invalid or expired", "SECURITY_MAGIC_LINK_INVALID"));
    }

    await prisma.magicLinkToken.update({
      where: { id: magic.id },
      data: { consumedAt: new Date() }
    });

    return res.json({ userId: magic.userId, consumed: true });
  } catch (error) {
    return next(error);
  }
}

export async function gdprExport(req, res, next) {
  try {
    const [user, leads, campaigns, tasks, opportunities] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user.id } }),
      prisma.lead.findMany({ where: { userId: req.user.id } }),
      prisma.campaign.findMany({ where: { userId: req.user.id } }),
      prisma.task.findMany({ where: { userId: req.user.id } }),
      prisma.opportunity.findMany({ where: { userId: req.user.id } })
    ]);

    return res.json({ user, leads, campaigns, tasks, opportunities });
  } catch (error) {
    return next(error);
  }
}

export async function gdprDelete(req, res, next) {
  try {
    await prisma.$transaction([
      prisma.task.deleteMany({ where: { userId: req.user.id } }),
      prisma.opportunity.deleteMany({ where: { userId: req.user.id } }),
      prisma.timelineEvent.deleteMany({ where: { userId: req.user.id } }),
      prisma.lead.deleteMany({ where: { userId: req.user.id } }),
      prisma.campaign.deleteMany({ where: { userId: req.user.id } }),
      prisma.userSession.deleteMany({ where: { userId: req.user.id } })
    ]);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        email: `deleted+${req.user.id}@deleted.local`,
        passwordHash: "deleted",
        unsubscribedAt: new Date()
      }
    });

    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
}

export async function unsubscribe(req, res, next) {
  try {
    const email = sanitizeEmail(req.body.email);
    if (!email) {
      return next(appError(400, "Email is required", "SECURITY_UNSUBSCRIBE_EMAIL_REQUIRED"));
    }

    const consent = await prisma.consentRecord.upsert({
      where: { userId_email: { userId: req.user.id, email } },
      update: { unsubscribed: true, source: "user" },
      create: {
        userId: req.user.id,
        email,
        unsubscribed: true,
        source: "user"
      }
    });

    return res.json(consent);
  } catch (error) {
    return next(error);
  }
}
