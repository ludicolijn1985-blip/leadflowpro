import { randomUUID } from "crypto";
import { logInfo } from "../lib/logger.js";

export function requestLogger(req, res, next) {
  const requestId = req.headers["x-request-id"] || randomUUID();
  const startedAt = Date.now();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    logInfo("HTTP request", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip
    });
  });

  next();
}