import { appError } from "../lib/errors.js";

export function requireAdmin(req, res, next) {
  if (req.user.teamRole !== "ADMIN") {
    return next(appError(403, "Admin access required", "FORBIDDEN_ADMIN"));
  }
  return next();
}
