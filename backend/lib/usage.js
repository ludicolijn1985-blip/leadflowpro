import { prisma } from "./prisma.js";

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function trackUsage(userId, delta) {
  const key = monthKey();
  await prisma.usageMetric.upsert({
    where: { userId_monthKey: { userId, monthKey: key } },
    update: {
      emails: { increment: delta.emails || 0 },
      imports: { increment: delta.imports || 0 }
    },
    create: {
      userId,
      monthKey: key,
      emails: delta.emails || 0,
      imports: delta.imports || 0
    }
  });
}

export async function assertUsageLimit(user, type, amount) {
  if (user.role === "PRO") {
    return;
  }

  const key = monthKey();
  const current = await prisma.usageMetric.findUnique({
    where: { userId_monthKey: { userId: user.id, monthKey: key } }
  });

  const currentValue = type === "emails" ? current?.emails || 0 : current?.imports || 0;
  const limit = type === "emails" ? 500 : 10;

  if (currentValue + amount > limit) {
    const err = new Error(`Monthly ${type} limit reached`);
    err.status = 403;
    err.code = "USAGE_LIMIT_REACHED";
    throw err;
  }
}
