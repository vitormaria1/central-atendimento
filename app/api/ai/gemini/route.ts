import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readDocTemplateBySlug } from "@/lib/templates";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
  templateSlug: z.string().min(1).optional(),
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
  const primaryModel = env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const fallbackModel = env.GEMINI_FALLBACK_MODEL ?? "gemini-2.5-pro";
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY não configurada" }, { status: 500 });
  const apiKeyHeader = apiKey as string;

  const history = parsed.data.history ?? [];
  const attachments = parsed.data.attachments ?? [];
  const templateSlug = parsed.data.templateSlug ?? null;
  const template = templateSlug ? await readDocTemplateBySlug(templateSlug) : null;

  const templateKeys = (() => {
    if (!template) return [];
    try {
      const zip = new PizZip(template.bytes.toString("binary"));
      const keys = new Set<string>();
      for (const name of Object.keys(zip.files)) {
        if (!name.startsWith("word/") || !name.endsWith(".xml")) continue;
        const txt = zip.file(name)?.asText() ?? "";
        const re = /{{\s*([A-Z0-9_]+)\s*}}/g;
        let m: RegExpExecArray | null = null;
        while ((m = re.exec(txt))) {
          const key = (m[1] ?? "").trim();
          if (key) keys.add(key);
        }
      }
      return Array.from(keys).sort();
    } catch {
      return [];
    }
  })();

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
        ...(template
          ? [
              { text: `Modelo selecionado: ${template.template.name} (${template.template.slug})` },
              ...(templateKeys.length ? [{ text: `Placeholders do modelo: ${templateKeys.join(", ")}` }] : []),
            ]
          : []),
        { text: parsed.data.prompt },
      ],
    },
  ];

  const systemInstruction = {
    role: "user",
    parts: [
      {
        text:
          "Você é a J.U.S.S.A.R.A. Responda SEMPRE em JSON válido no formato {\"text\": string, \"files\"?: [{\"filename\": string, \"mimeType\": string, \"base64\": string}]}. " +
          "Quando o usuário pedir para criar/gerar um arquivo (PDF, DOC, planilha, etc.), inclua o arquivo em \"files\" com base64 do conteúdo do arquivo e um nome em \"filename\". " +
          "Se não for possível gerar um binário real, gere o arquivo como texto/markdown/csv/json (conforme solicitado) e coloque em files com mimeType apropriado (ex.: text/plain, text/markdown, text/csv, application/json). " +
          "Quando houver um 'Modelo selecionado', extraia os dados do usuário para preencher os placeholders e devolva também um objeto \"templateData\" com chaves exatas dos placeholders (strings).",
      },
    ],
  };

  const requestBody = {
    systemInstruction,
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 800,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          templateData: { type: "object" },
          outputFilename: { type: "string" },
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
  };

  async function callGemini(model: string) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKeyHeader,
        },
        body: JSON.stringify(requestBody),
      },
    );
    const data = (await res.json().catch(() => null)) as unknown;
    return { res, data, model };
  }

  let attempt = await callGemini(primaryModel);
  const shouldFallback = !attempt.res.ok && fallbackModel && fallbackModel !== primaryModel;
  if (shouldFallback) {
    attempt = await callGemini(fallbackModel);
  }

  const data = attempt.data;
  if (!attempt.res.ok) {
    const message =
      typeof (data as { error?: { message?: unknown } } | null)?.error?.message === "string"
        ? ((data as { error?: { message?: string } }).error!.message as string)
        : "Falha ao chamar Gemini";
    return NextResponse.json({ error: message, model: attempt.model }, { status: 502 });
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

  async function makePdfBase64(text: string) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 11;
    const margin = 48;
    const maxWidth = page.getWidth() - margin * 2;
    const lineHeight = fontSize * 1.35;

    const words = text.replaceAll("\r\n", "\n").split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      const width = font.widthOfTextAtSize(next, fontSize);
      if (width <= maxWidth) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);

    let y = page.getHeight() - margin;
    for (const line of lines) {
      if (y < margin + lineHeight) {
        // new page
        const p = pdfDoc.addPage([595.28, 841.89]);
        y = p.getHeight() - margin;
        p.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
        y -= lineHeight;
      } else {
        page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
        y -= lineHeight;
      }
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes).toString("base64");
  }

  if (
    parsedJson &&
    typeof (parsedJson as { text?: unknown }).text === "string" &&
    (() => {
      const rec = parsedJson as Record<string, unknown>;
      return !("files" in rec) || Array.isArray(rec.files);
    })()
  ) {
    const json = parsedJson as {
      text: string;
      files?: Array<{ filename: string; mimeType: string; base64: string }>;
      templateData?: Record<string, unknown>;
      outputFilename?: string;
    };
    let files = Array.isArray(json.files) ? json.files.slice(0, 3) : [];

    // If a template is selected, auto-generate a DOCX from the templateData.
    if (template && json.templateData && typeof json.templateData === "object") {
      const data: Record<string, string> = {};
      for (const k of templateKeys) {
        const v = (json.templateData as Record<string, unknown>)[k];
        if (typeof v === "string" && v.trim()) data[k] = v.trim();
      }

      if (Object.keys(data).length > 0) {
        const zip = new PizZip(template.bytes.toString("binary"));
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: { start: "{{", end: "}}" },
        });
        doc.render(data);
        const buffer = doc.getZip().generate({ type: "nodebuffer" }) as Buffer;

        const baseName = (json.outputFilename && json.outputFilename.trim()) || `${template.template.name} - GERADO`;
        const filename = baseName.toLowerCase().endsWith(".docx") ? baseName : `${baseName}.docx`;
        files = [
          {
            filename,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            base64: buffer.toString("base64"),
          },
          ...files,
        ].slice(0, 3);
      }
    }

    const wantsPdf =
      /\bpdf\b/i.test(parsed.data.prompt) ||
      /\bdocumento\b/i.test(parsed.data.prompt) ||
      /não consigo criar um arquivo pdf/i.test(json.text);

    if (wantsPdf && files.length === 0) {
      const base64 = await makePdfBase64(json.text);
      files = [{ filename: "documento.pdf", mimeType: "application/pdf", base64 }];
    }

    return NextResponse.json({ text: json.text, files });
  }

  // Fallback: treat as plain text.
  const wantsPdf = /\bpdf\b/i.test(parsed.data.prompt) || /\bdocumento\b/i.test(parsed.data.prompt) || /não consigo criar um arquivo pdf/i.test(rawText);
  if (wantsPdf) {
    const base64 = await makePdfBase64(rawText);
    return NextResponse.json({ text: rawText, files: [{ filename: "documento.pdf", mimeType: "application/pdf", base64 }] });
  }

  return NextResponse.json({ text: rawText });
});
