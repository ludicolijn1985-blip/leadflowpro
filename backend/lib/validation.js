export function sanitizeText(value, maxLength = 1000) {
  const text = String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();

  if (maxLength > 0 && text.length > maxLength) {
    return text;
  }

  return text;
}

export function sanitizeEmail(value) {
  return sanitizeText(value, 320).toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

export function isCuidLike(value) {
  return /^c[a-z0-9]{20,}$/i.test(String(value || ""));
}

export function sanitizeJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    const cleanKey = sanitizeText(key, 64);
    if (!cleanKey) {
      continue;
    }

    if (typeof raw === "string") {
      output[cleanKey] = sanitizeText(raw, 400);
      continue;
    }

    if (typeof raw === "number" || typeof raw === "boolean") {
      output[cleanKey] = raw;
    }
  }

  return output;
}

export function isValidUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function safeDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}