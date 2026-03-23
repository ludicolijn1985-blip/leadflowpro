function stringify(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({ level: "error", message: "Failed to serialize log payload" });
  }
}

export function logInfo(message, context = {}) {
  console.log(
    stringify({
      level: "info",
      message,
      time: new Date().toISOString(),
      ...context
    })
  );
}

export function logWarn(message, context = {}) {
  console.warn(
    stringify({
      level: "warn",
      message,
      time: new Date().toISOString(),
      ...context
    })
  );
}

export function logError(message, context = {}) {
  const log = stringify({
    level: "error",
    message,
    ...context,
  });

  if (process.env.NODE_ENV === "test") {
    // voorkom CI failure
    console.log(log);
  } else {
    console.error(log);
  }
}