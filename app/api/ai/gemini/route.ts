import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
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
  const contents = [
    ...history.slice(-12).map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    {
      role: "user",
      parts: [{ text: parsed.data.prompt }],
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

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> } | null)?.candidates?.[0]?.content
    ?.parts;
  const text = (parts ?? [])
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n");
  if (!text) return NextResponse.json({ error: "Resposta vazia" }, { status: 502 });

  return NextResponse.json({ text });
});
