type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "\"[unserializable]\"";
  }
}

function redactMeta(meta: LogMeta) {
  const out: LogMeta = {};
  for (const [k, v] of Object.entries(meta)) {
    const key = k.toLowerCase();
    if (
      key.includes("password") ||
      key.includes("pin") ||
      key.includes("token") ||
      key.includes("secret") ||
      key.includes("authorization") ||
      key.includes("cookie")
    ) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function log(level: LogLevel, message: string, meta: LogMeta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...redactMeta(meta),
  };

  // Keep it simple: JSON logs (good for Vercel logs / log drains).
  console[level === "debug" ? "log" : level](safeStringify(entry));
}

export function newRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}
