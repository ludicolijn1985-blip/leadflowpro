import dotenv from "dotenv";

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseOrigins(raw) {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\/$/, ""));
}

function parseNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    if (fallback === undefined) {
      throw new Error(`Missing required numeric environment variable: ${name}`);
    }
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return parsed;
}

export const config = {
  port: parseNumber("PORT", 8080),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  stripeSecretKey: required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
  stripePriceId: required("STRIPE_PRICE_ID"),
  smtpHost: required("SMTP_HOST"),
  smtpPort: parseNumber("SMTP_PORT"),
  smtpUser: required("SMTP_USER"),
  smtpPass: required("SMTP_PASS"),
  smtpFrom: required("SMTP_FROM"),
  frontendUrl: required("FRONTEND_URL").replace(/\/$/, ""),
  backendUrl: required("BACKEND_URL"),
  corsOrigins: parseOrigins(required("FRONTEND_URL")),
  nodeEnv: process.env.NODE_ENV || "development"
};