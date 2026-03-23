function stringify(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      level: "error",
      message: "Failed to serialize log payload"
    });
  }
}

const isTest = process.env.NODE_ENV === "test";

export function logInfo(message, context = {}) {
  const log = stringify({
    level: "info",
    message,
    time: new Date().toISOString(),
    ...context
  });

  console.log(log);
}

export function logWarn(message, context = {}) {
  const log = stringify({
    level: "warn",
    message,
    time: new Date().toISOString(),
    ...context
  });

  if (isTest) {
    console.log(log); // 🔥 GEEN warn in tests
  } else {
    console.warn(log);
  }
}

export function logError(message, context = {}) {
  const log = stringify({
    level: "error",
    message,
    time: new Date().toISOString(),
    ...context
  });

  if (isTest) {
    console.log(log); // 🔥 GEEN error in tests
  } else {
    console.error(log);
  }
}