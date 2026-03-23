import { execSync } from "child_process";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { logError, logInfo } from "./lib/logger.js";
import { verifySmtpConnection } from "./lib/mailer.js";
import { connectPrismaWithRetry, disconnectPrisma } from "./lib/prisma.js";

try {
  execSync("./node_modules/.bin/prisma generate", { stdio: "inherit" });
  execSync("./node_modules/.bin/prisma db push", { stdio: "inherit" });
} catch (e) {
  console.error("Prisma error:", e.message);
}

const app = createApp();
let server;
let isShuttingDown = false;

async function bootstrap() {
  await connectPrismaWithRetry();
  await verifySmtpConnection();

  server = app.listen(config.port, () => {
    logInfo("Leadflow Pro API running", { port: config.port, env: config.nodeEnv });
  });
}

bootstrap().catch((error) => {
  logError("Failed to bootstrap server", { error: error.message, stack: error.stack });
  process.exit(1);
});

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logInfo("Shutdown started");

  const forceCloseTimer = setTimeout(() => {
    logError("Forced shutdown due to timeout");
    process.exit(1);
  }, 10000);

  try {
    await disconnectPrisma();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    clearTimeout(forceCloseTimer);
    logInfo("Shutdown completed");
    process.exit(0);
  } catch (error) {
    clearTimeout(forceCloseTimer);
    logError("Shutdown failed", { error: error.message });
    process.exit(1);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);