import { execSync } from "child_process";
import { prisma } from "../lib/prisma.js";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/leadflow_pro_test";
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test_jwt_secret";
}
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
}
if (!process.env.STRIPE_PRICE_ID) {
  process.env.STRIPE_PRICE_ID = "price_test_123";
}
if (!process.env.SMTP_HOST) {
  process.env.SMTP_HOST = "localhost";
}
if (!process.env.SMTP_PORT) {
  process.env.SMTP_PORT = "1025";
}
if (!process.env.SMTP_USER) {
  process.env.SMTP_USER = "test";
}
if (!process.env.SMTP_PASS) {
  process.env.SMTP_PASS = "test";
}
if (!process.env.SMTP_FROM) {
  process.env.SMTP_FROM = "no-reply@test.local";
}
if (!process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL = "http://localhost:5173";
}
if (!process.env.BACKEND_URL) {
  process.env.BACKEND_URL = "http://localhost:8080";
}

if (!String(process.env.DATABASE_URL).toLowerCase().includes("test")) {
  throw new Error("Tests require a dedicated test DATABASE_URL");
}

beforeAll(async () => {
  execSync("./node_modules/.bin/prisma generate", { stdio: "ignore" });
  execSync("./node_modules/.bin/prisma db push", { stdio: "ignore" });
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.webhookEvent.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
