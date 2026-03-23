import { PrismaClient } from "@prisma/client";
import { logError, logInfo, logWarn } from "./logger.js";

export const prisma = new PrismaClient({
  log: ["warn", "error"]
});

let connected = false;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function connectPrismaWithRetry(options = {}) {
  const maxAttempts = options.maxAttempts || 6;
  const initialDelayMs = options.initialDelayMs || 1000;

  if (connected) {
    return;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      connected = true;
      logInfo("Database connection established", { attempt });
      return;
    } catch (error) {
      const isLast = attempt === maxAttempts;
      logWarn("Database connection attempt failed", {
        attempt,
        maxAttempts,
        error: error.message
      });

      if (isLast) {
        logError("Database connection retries exhausted", { error: error.message });
        throw error;
      }

      const sleepMs = initialDelayMs * attempt;
      await delay(sleepMs);
    }
  }
}

export async function disconnectPrisma() {
  if (!connected) {
    return;
  }

  await prisma.$disconnect();
  connected = false;
  logInfo("Database disconnected");
}