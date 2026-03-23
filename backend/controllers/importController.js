import { parse } from "csv-parse/sync";
import { appError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { canAddLeads } from "./leadsController.js";
import { isValidEmail, sanitizeEmail, sanitizeText } from "../lib/validation.js";
import { assertUsageLimit, trackUsage } from "../lib/usage.js";
import { writeActivity, writeAuditLog } from "../lib/audit.js";

const MAX_IMPORT_ROWS = 1000;

function normalizeRow(row) {
  return {
    name: sanitizeText(row.name || row.Name, 120),
    email: sanitizeEmail(row.email || row.Email),
    status: sanitizeText(row.status || row.Status || "NEW", 60)
  };
}

export async function importCsv(req, res, next) {
  try {
    if (!req.file) {
      return next(appError(400, "CSV file is required", "IMPORT_FILE_REQUIRED"));
    }

    if (!req.file.mimetype.includes("csv") && !req.file.originalname.toLowerCase().endsWith(".csv")) {
      return next(appError(400, "Only CSV files are supported", "IMPORT_INVALID_FILE_TYPE"));
    }

    const raw = req.file.buffer.toString("utf-8");
    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: false
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return next(appError(400, "CSV has no data rows", "IMPORT_EMPTY"));
    }

    const firstRow = rows[0] || {};
    const keys = Object.keys(firstRow).map((entry) => entry.toLowerCase());
    if (!keys.includes("name") || !keys.includes("email")) {
      return next(appError(400, "CSV must include name and email headers", "IMPORT_HEADERS_INVALID"));
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return next(appError(400, `CSV exceeds row limit (${MAX_IMPORT_ROWS})`, "IMPORT_TOO_LARGE"));
    }

    const normalized = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = normalizeRow(rows[index]);
      if (!row.name || !row.email || !row.status) {
        continue;
      }
      if (!isValidEmail(row.email)) {
        continue;
      }
      normalized.push(row);
    }

    if (normalized.length === 0) {
      return next(appError(400, "CSV has no valid rows", "IMPORT_NO_VALID_ROWS"));
    }

    await canAddLeads(req.user.id, req.user.role, normalized.length);
    await assertUsageLimit(req.user, "imports", 1);

    await prisma.lead.createMany({
      data: normalized.map((lead) => ({
        userId: req.user.id,
        name: lead.name,
        email: lead.email,
        status: lead.status,
        duplicateKey: lead.email,
        isDemo: false
      }))
    });

    await prisma.userStats.upsert({
      where: { userId: req.user.id },
      update: { leadsImported: { increment: normalized.length } },
      create: { userId: req.user.id, leadsImported: normalized.length }
    });

    await trackUsage(req.user.id, { imports: 1 });
    await writeActivity({
      userId: req.user.id,
      type: "import.csv",
      message: `CSV import completed with ${normalized.length} leads`,
      metadata: { imported: normalized.length }
    });
    await writeAuditLog({ userId: req.user.id, action: "import.csv", resource: "lead", metadata: { imported: normalized.length } });

    return res.status(201).json({ imported: normalized.length });
  } catch (error) {
    if (error.code === "CSV_INVALID_RECORD_LENGTH") {
      return next(appError(400, "Malformed CSV content", "IMPORT_MALFORMED_CSV"));
    }

    return next(error);
  }
}