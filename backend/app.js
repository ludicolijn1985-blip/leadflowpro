import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { handleStripeWebhook } from "./controllers/billingController.js";
import { config } from "./config.js";
import { appError } from "./lib/errors.js";
import authRoutes from "./routes/authRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import leadsRoutes from "./routes/leadsRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, message: "Too many authentication attempts", code: "RATE_LIMIT_AUTH" }
  });

  const billingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, message: "Too many billing requests", code: "RATE_LIMIT_BILLING" }
  });

  const importLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, message: "Too many import requests", code: "RATE_LIMIT_IMPORT" }
  });

  const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: true, message: "Webhook rate limit exceeded", code: "RATE_LIMIT_WEBHOOK" }
  });

  const corsOptions = {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const cleaned = String(origin).replace(/\/$/, "");
      if (config.corsOrigins.includes(cleaned)) {
        callback(null, true);
        return;
      }

      callback(appError(403, "CORS blocked", "CORS_BLOCKED"));
    },
    credentials: true
  };

  app.post("/api/billing/webhook", webhookLimiter, express.raw({ type: "application/json" }), handleStripeWebhook);

  app.use(cors(corsOptions));
  app.use(helmet());
  app.use(requestLogger);
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: true, message: "Too many requests", code: "RATE_LIMIT_GLOBAL" }
    })
  );
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/leads", leadsRoutes);
  app.use("/api/campaigns", campaignRoutes);
  app.use("/api/import", importLimiter, importRoutes);
  app.use("/api/billing", billingLimiter, billingRoutes);

  app.use((req, res, next) => {
    next(appError(404, "Route not found", "ROUTE_NOT_FOUND"));
  });

  app.use(errorHandler);

  return app;
}
