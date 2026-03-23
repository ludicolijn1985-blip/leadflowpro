import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { appError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

export async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return next(appError(401, "Missing token", "AUTH_MISSING_TOKEN"));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload || typeof payload !== "object" || !payload.userId) {
      return next(appError(401, "Invalid token", "AUTH_INVALID_TOKEN"));
    }

    if (payload.sessionId) {
      const activeSession = await prisma.userSession.findUnique({ where: { tokenId: String(payload.sessionId) } });
      if (!activeSession || activeSession.revokedAt || activeSession.expiresAt < new Date()) {
        return next(appError(401, "Session expired", "AUTH_SESSION_EXPIRED"));
      }
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user) {
      return next(appError(401, "Invalid token", "AUTH_INVALID_TOKEN"));
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      teamRole: user.teamRole,
      referralCode: user.referralCode,
      referredBy: user.referredBy,
      trialEnd: user.trialEnd,
      locale: user.locale,
      theme: user.theme
    };
    return next();
  } catch (error) {
    return next(appError(401, "Invalid token", "AUTH_INVALID_TOKEN"));
  }
}