import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { appError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { generateUniqueReferralCode } from "../lib/referral.js";
import { isValidEmail, sanitizeEmail, sanitizeText } from "../lib/validation.js";
import { writeAuditLog } from "../lib/audit.js";
import { buildLeadSuggestions, getTemplate } from "../lib/sequences.js";

function signToken(userId, sessionId) {
  return jwt.sign({ userId, sessionId }, config.jwtSecret, { expiresIn: "7d" });
}

function createSessionId() {
  return crypto.randomUUID();
}

function renderTemplate(template, data) {
  return String(template || "").replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const cleaned = String(key || "").trim();
    return String(data[cleaned] || "there");
  });
}

async function seedQuickStart(user) {
  if (config.nodeEnv === "test") {
    return;
  }

  const existingLeads = await prisma.lead.count({ where: { userId: user.id } });
  if (existingLeads > 0) {
    return;
  }

  const niche = "agencies";
  const offer = "client acquisition";
  const template = getTemplate(niche);
  const sender = user.email.split("@")[0];
  const suggestions = buildLeadSuggestions(niche, offer).slice(0, 3);

  await prisma.$transaction(async (tx) => {
    const defaultStage = await tx.pipelineStage.findFirst({
      where: { userId: user.id, isDefault: true },
      orderBy: { sortOrder: "asc" }
    });

    await tx.lead.createMany({
      data: suggestions.map((lead) => ({
        userId: user.id,
        stageId: defaultStage?.id || null,
        name: lead.name,
        email: lead.email,
        status: lead.status,
        customFields: lead.customFields,
        duplicateKey: lead.email,
        isDemo: true
      }))
    });

    if (template) {
      await tx.campaign.create({
        data: {
          userId: user.id,
          name: "Quickstart Campaign",
          subject: renderTemplate(template.subject, { offer, sender, company: "your business" }),
          body: renderTemplate(template.body, { offer, sender, niche })
        }
      });
    }

    await tx.userStats.upsert({
      where: { userId: user.id },
      update: { leadsImported: { increment: suggestions.length } },
      create: { userId: user.id, leadsImported: suggestions.length }
    });
  });
}

export async function register(req, res, next) {
  try {
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const referralCode = sanitizeText(req.body.referralCode, 24).toUpperCase();

    if (!email || !password) {
      return next(appError(400, "Email and password are required", "AUTH_VALIDATION_ERROR"));
    }

    if (!isValidEmail(email)) {
      return next(appError(400, "Invalid email format", "AUTH_INVALID_EMAIL"));
    }

    if (password.length < 8) {
      return next(appError(400, "Password must be at least 8 characters", "AUTH_WEAK_PASSWORD"));
    }

    if (password.length > 72) {
      return next(appError(400, "Password is too long", "AUTH_INVALID_PASSWORD"));
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return next(appError(409, "Email already registered", "AUTH_EMAIL_EXISTS"));
    }

    let referredBy = null;
    if (referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode } });
      if (!referrer) {
        return next(appError(400, "Referral code is invalid", "AUTH_INVALID_REFERRAL"));
      }
      referredBy = referrer.id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const ownReferralCode = await generateUniqueReferralCode(prisma);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        referralCode: ownReferralCode,
        referredBy,
        trialStart: new Date(),
        trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.userStats.create({ data: { userId: user.id } });
    await prisma.milestone.create({ data: { userId: user.id } });

    const sessionId = createSessionId();
    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenId: sessionId,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || "",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const token = signToken(user.id, sessionId);
    await writeAuditLog({ userId: user.id, action: "auth.register", resource: "user" });

    await prisma.pipelineStage.createMany({
      data: [
        { userId: user.id, name: "New", sortOrder: 1, isDefault: true, color: "#38bdf8" },
        { userId: user.id, name: "Contacted", sortOrder: 2, color: "#22c55e" },
        { userId: user.id, name: "Qualified", sortOrder: 3, color: "#eab308" },
        { userId: user.id, name: "Won", sortOrder: 4, color: "#a855f7" }
      ]
    });

    await seedQuickStart(user);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        teamRole: user.teamRole,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        trialEnd: user.trialEnd
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function login(req, res, next) {
  try {
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return next(appError(400, "Email and password are required", "AUTH_VALIDATION_ERROR"));
    }

    if (!isValidEmail(email)) {
      return next(appError(400, "Invalid email format", "AUTH_INVALID_EMAIL"));
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return next(appError(401, "Invalid credentials", "AUTH_INVALID_CREDENTIALS"));
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return next(appError(401, "Invalid credentials", "AUTH_INVALID_CREDENTIALS"));
    }

    if (user.twoFactorEnabled) {
      const otp = sanitizeText(req.body.otp, 10);
      if (!otp || otp !== sanitizeText(req.body.challenge, 10)) {
        return next(appError(401, "Two-factor challenge required", "AUTH_2FA_REQUIRED"));
      }
    }

    const sessionId = createSessionId();
    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenId: sessionId,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || "",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const token = signToken(user.id, sessionId);
    await writeAuditLog({ userId: user.id, action: "auth.login", resource: "session" });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        teamRole: user.teamRole,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
        trialEnd: user.trialEnd,
        twoFactorEnabled: user.twoFactorEnabled,
        locale: user.locale,
        theme: user.theme
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    const [leadCount, campaignCount, stats, milestones] = await Promise.all([
      prisma.lead.count({ where: { userId: req.user.id } }),
      prisma.campaign.count({ where: { userId: req.user.id } }),
      prisma.userStats.findUnique({ where: { userId: req.user.id } }),
      prisma.milestone.findUnique({ where: { userId: req.user.id } })
    ]);

    const estimatedClients = Math.max(0, Math.round(((stats?.replies || 0) * 0.2 + (stats?.conversations || 0) * 0.1) * 10) / 10);
    const firstClientProgress = {
      firstReply: Boolean(milestones?.firstReplyAt),
      firstMeeting: Boolean(milestones?.firstMeetingAt),
      firstClient: Boolean(milestones?.firstClientAt)
    };

    return res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      teamRole: req.user.teamRole,
      referralCode: req.user.referralCode,
      referredBy: req.user.referredBy,
      leadCount,
      campaignCount,
      trialEnd: req.user.trialEnd,
      locale: req.user.locale,
      theme: req.user.theme,
      stats: {
        replies: stats?.replies || 0,
        campaignsSent: stats?.campaignsSent || 0,
        leadsImported: stats?.leadsImported || 0,
        conversations: stats?.conversations || 0,
        clients: stats?.clients || 0,
        estimatedClients
      },
      milestones: milestones || null,
      firstClientProgress,
      viralUnlockReady: (stats?.replies || 0) > 0
    });
  } catch (error) {
    return next(error);
  }
}