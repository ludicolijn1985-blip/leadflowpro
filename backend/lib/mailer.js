import nodemailer from "nodemailer";
import { config } from "../config.js";
import { appError } from "./errors.js";
import { logInfo, logWarn } from "./logger.js";

let transporter;
let verifyPromise;

const BATCH_SIZE = 25;
const SEND_TIMEOUT_MS = 15000;
const SEND_RETRIES = 2;

function createTransporter() {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS
  });

  return transporter;
}

async function ensureSmtpReady() {
  if (!verifyPromise) {
    verifyPromise = createTransporter().verify();
  }

  try {
    await verifyPromise;
  } catch (error) {
    verifyPromise = undefined;
    throw error;
  }
}

async function sendWithRetry(payload) {
  let attempt = 0;
  while (attempt <= SEND_RETRIES) {
    try {
      await createTransporter().sendMail(payload);
      return true;
    } catch (error) {
      attempt += 1;
      if (attempt > SEND_RETRIES) {
        return false;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 300 * attempt);
      });
      logWarn("Email retry scheduled", { to: payload.to, attempt, error: error.message });
    }
  }

  return false;
}

export async function verifySmtpConnection() {
  try {
    await ensureSmtpReady();
    logInfo("SMTP connection verified");
  } catch (error) {
    throw appError(500, "SMTP verification failed", "SMTP_VERIFY_FAILED");
  }
}

export async function sendBulkEmail({ recipients, subject, html }) {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return { sent: 0, failed: 0 };
  }

  await ensureSmtpReady();
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < recipients.length; index += BATCH_SIZE) {
    const batch = recipients.slice(index, index + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((to) =>
        sendWithRetry({
          from: config.smtpFrom,
          to,
          subject,
          html
        })
      )
    );

    for (const ok of results) {
      if (ok) {
        sent += 1;
      } else {
        failed += 1;
      }
    }
  }

  logInfo("Campaign email delivery completed", {
    recipients: recipients.length,
    sent,
    failed
  });

  if (sent === 0 && failed > 0) {
    throw appError(502, "Failed to deliver campaign emails", "EMAIL_SEND_FAILED");
  }

  return { sent, failed };
}