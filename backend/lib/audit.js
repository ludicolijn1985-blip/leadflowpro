import { prisma } from "./prisma.js";

export async function writeAuditLog({ userId, action, resource, metadata }) {
  if (!userId || !action || !resource) {
    return;
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action,
      resource,
      metadata: metadata || {}
    }
  });
}

export async function writeActivity({ userId, type, message, leadId, campaignId, metadata }) {
  if (!userId || !type || !message) {
    return;
  }

  await prisma.activityEvent.create({
    data: {
      userId,
      type,
      message,
      leadId: leadId || null,
      campaignId: campaignId || null,
      metadata: metadata || {}
    }
  });
}
