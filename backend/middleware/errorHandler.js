import { logError } from "../lib/logger.js";

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.status || 500;
  const isProduction = process.env.NODE_ENV === "production";
  const message = status >= 500 && isProduction ? "Internal server error" : error.message || "Internal server error";

  logError("Request failed", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    code: error.code,
    message: error.message,
    stack: error.stack
  });

  const payload = { error: true, message };
  if (error.code) {
    payload.code = error.code;
  }

  return res.status(status).json(payload);
}