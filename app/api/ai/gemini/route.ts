import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
  attachments: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        mimeType: z.string().min(1).max(200),
        dataBase64: z.string().min(1),
      }),
    )
    .max(6)
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        text: z.string().min(1).max(10_000),
      }),
    )
    .optional(),
});

export const POST = withApi(async (req: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const env = getEnv();
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL ?? "gemini-2.5-flash";
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY não configurada" }, { status: 500 });

  const history = parsed.data.history ?? [];
  const attachments = parsed.data.attachments ?? [];

  const attachmentParts = attachments.map((a) => ({
    inlineData: {
      mimeType: a.mimeType,
      data: a.dataBase64,
    },
  }));

  const attachmentLabelText = attachments.length
    ? `Anexos: ${attachments.map((a) => a.name).join(", ")}`
    : null;

  const contents = [
    ...history.slice(-12).map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    {
      role: "user",
      parts: [
        ...(attachmentLabelText ? [{ text: attachmentLabelText }] : []),
        ...attachmentParts,
        { text: parsed.data.prompt },
      ],
    },
  ];

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  filename: { type: "string" },
                  mimeType: { type: "string" },
                  base64: { type: "string" },
                },
                required: ["filename", "mimeType", "base64"],
              },
            },
          },
          required: ["text"],
        },
      },
    }),
  });

  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      typeof (data as { error?: { message?: unknown } } | null)?.error?.message === "string"
        ? ((data as { error?: { message?: string } }).error!.message as string)
        : "Falha ao chamar Gemini";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> } | null)?.candidates?.[0]
    ?.content?.parts;
  const rawText = (parts ?? [])
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!rawText) return NextResponse.json({ error: "Resposta vazia" }, { status: 502 });

  // In JSON mode, model returns JSON as text.
  const parsedJson = (() => {
    try {
      return JSON.parse(rawText) as unknown;
    } catch {
      return null;
    }
  })();

  if (
    parsedJson &&
    typeof (parsedJson as { text?: unknown }).text === "string" &&
    (() => {
      const rec = parsedJson as Record<string, unknown>;
      return !("files" in rec) || Array.isArray(rec.files);
    })()
  ) {
    const json = parsedJson as { text: string; files?: Array<{ filename: string; mimeType: string; base64: string }> };
    const files = Array.isArray(json.files) ? json.files.slice(0, 3) : [];
    return NextResponse.json({ text: json.text, files });
  }

  // Fallback: treat as plain text.
  return NextResponse.json({ text: rawText });
});
