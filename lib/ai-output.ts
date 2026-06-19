type AssistantFile = {
  filename: string;
  mimeType: string;
  base64: string;
};

type AssistantPayload = {
  text: string;
  files?: AssistantFile[];
  templateData?: Record<string, unknown>;
  outputFilename?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stripCodeFences(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] ?? trimmed : trimmed;
}

function extractJsonCandidate(raw: string) {
  const text = stripCodeFences(raw);
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {}

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as unknown;
    } catch {}
  }

  return null;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const parsed = extractJsonCandidate(value);
  if (parsed === null) return null;
  if (typeof parsed === "string" && parsed !== value) return parseMaybeJson(parsed);
  return parsed;
}

export function extractAssistantPayload(rawText: string): AssistantPayload | null {
  const parsed = parseMaybeJson(rawText);
  if (!isRecord(parsed)) return null;

  const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
  if (!text) return null;

  const payload: AssistantPayload = { text };

  if (typeof parsed.outputFilename === "string" && parsed.outputFilename.trim()) {
    payload.outputFilename = parsed.outputFilename.trim();
  }

  if (isRecord(parsed.templateData)) {
    payload.templateData = parsed.templateData;
  }

  if (Array.isArray(parsed.files)) {
    const files = parsed.files
      .map((item) => {
        if (!isRecord(item)) return null;
        const filename = typeof item.filename === "string" ? item.filename.trim() : "";
        const mimeType = typeof item.mimeType === "string" ? item.mimeType.trim() : "";
        const base64 = typeof item.base64 === "string" ? item.base64.trim() : "";
        if (!filename || !mimeType || !base64) return null;
        return { filename, mimeType, base64 };
      })
      .filter((item): item is AssistantFile => Boolean(item));

    if (files.length > 0) payload.files = files;
  }

  return payload;
}

export function normalizeAssistantDisplayText(rawText: string) {
  return extractAssistantPayload(rawText)?.text ?? rawText.trim();
}

export function friendlyAiErrorMessage(message: string, status?: number) {
  const normalized = message.trim();
  const lower = normalized.toLowerCase();

  if (status === 429 || lower.includes("quota") || lower.includes("rate limit") || lower.includes("resource has been exhausted")) {
    return "A Jussara atingiu um limite temporário do provedor de IA. Tente novamente em alguns minutos.";
  }

  if (lower.includes("pdf") && (lower.includes("erro") || lower.includes("failed") || lower.includes("falha"))) {
    return "Não consegui gerar o PDF agora. Tente novamente em alguns minutos.";
  }

  if (!normalized) {
    return "Não consegui gerar a resposta agora. Tente novamente.";
  }

  return "Não consegui gerar a resposta agora. Tente novamente.";
}
