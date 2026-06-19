import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { extractAssistantPayload, friendlyAiErrorMessage, normalizeAssistantDisplayText } from "@/lib/ai-output";
import { buildServiceContractDraft, shouldUseServiceContractFlow } from "@/lib/contract-generation";
import { renderMarkdownPdfBase64 } from "@/lib/pdf-render";
import { getSession } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { readDocTemplateBySlug } from "@/lib/templates";
import {
  appendAiMessage,
  buildAiContext,
  createAiThread,
  getAiThread,
  refreshAiThreadSummary,
  touchAiThread,
  type AiStoredAttachment,
  type AiStoredFile,
} from "@/lib/ai-memory";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  prompt: z.string().min(1).max(10_000),
  threadId: z.string().optional(),
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
  const threadIdRaw = parsed.data.threadId ?? "";
  const parsedThreadId = threadIdRaw ? Number.parseInt(threadIdRaw, 10) : Number.NaN;
  const templateSlug = parsed.data.templateSlug ?? null;
  const template = templateSlug ? await readDocTemplateBySlug(templateSlug) : null;
  const documentMode = !template && shouldUseServiceContractFlow(parsed.data.prompt);
  const existingThread = Number.isFinite(parsedThreadId) ? await getAiThread(session.agentId, parsedThreadId) : null;
  const thread = existingThread ?? (await createAiThread(session.agentId, parsed.data.prompt));
  const threadId = Number.parseInt(thread.id, 10);

  const storedAttachments: AiStoredAttachment[] = attachments.map((item) => ({
    name: item.name,
    mimeType: item.mimeType,
    dataBase64: item.dataBase64,
  }));

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

  const context = await buildAiContext(threadId);
  const contextHistory = context.recentHistory.length > 0 ? context.recentHistory : history.slice(-12);

  const contents = [
    ...(context.olderSummary
      ? [
          {
            role: "user" as const,
            parts: [{ text: `Resumo da conversa até agora:\n${context.olderSummary}` }],
          },
        ]
      : []),
    ...contextHistory.map((h) => ({
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
          (
            documentMode
              ? "Você é a J.U.S.S.A.R.A. Quando o usuário pedir um contrato ou documento, entregue um corpo completo e útil, com estrutura profissional, títulos, seções e cláusulas numeradas. Não responda com frases curtas, introduções repetidas, ou avisos sobre limitações. " +
                "Responda sempre em JSON válido no formato {\"text\": string, \"documentMarkdown\"?: string, \"files\"?: [{\"filename\": string, \"mimeType\": string, \"base64\": string}]}. " +
                "Para documentos, preencha documentMarkdown com o conteúdo completo do documento em Markdown limpo. Se o usuário pedir PDF, esse conteúdo será convertido em PDF pelo sistema, então ele precisa estar completo e pronto para publicação. " +
                "Se o pedido for um contrato de prestação de serviços de desenvolvimento de software, gere um contrato completo com: partes, objeto, obrigações, prazo, remuneração, propriedade intelectual, confidencialidade, aceitação, rescisão, disposições gerais e foro. " +
                "Use campos em branco entre colchetes apenas para os dados que o usuário pediu para deixar em aberto."
              : "Você é a J.U.S.S.A.R.A. Responda de forma direta, sem introduções repetidas, sem explicar limitações internas e sem oferecer formatos alternativos antes de entregar o que foi pedido. Responda sempre em JSON válido no formato {\"text\": string, \"files\"?: [{\"filename\": string, \"mimeType\": string, \"base64\": string}]}. " +
                "Quando o usuário pedir um arquivo, entregue o arquivo no formato solicitado. Se o pedido for PDF, gere o PDF real. Se houver um conteúdo textual, arquivo Markdown ou outro texto gerado, converta esse conteúdo em PDF quando necessário. "
          ) +
          "Quando houver um 'Modelo selecionado', extraia os dados do usuário para preencher os placeholders e devolva também um objeto \"templateData\" com chaves exatas dos placeholders (strings).",
      },
    ],
  };

  const requestBody = {
    systemInstruction,
    contents,
    generationConfig: {
      temperature: documentMode ? 0.2 : 0.3,
      maxOutputTokens: documentMode ? 2400 : 800,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          documentMarkdown: { type: "string" },
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

  async function callGemini(model: string, strict = false) {
    const retryRequestBody = strict
      ? {
          ...requestBody,
          generationConfig: {
            ...requestBody.generationConfig,
            temperature: 0.1,
            maxOutputTokens: 3200,
          },
          contents: [
            ...contents,
            {
              role: "user" as const,
              parts: [
                {
                  text:
                    "Reescreva a resposta anterior como um documento completo e pronto para uso. Não use frases como 'segue o PDF solicitado'. " +
                    "Para contratos, inclua texto substancial em todas as seções e preserve os campos em branco solicitados.",
                },
              ],
            },
          ],
        }
      : requestBody;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKeyHeader,
        },
        body: JSON.stringify(retryRequestBody),
      },
    );
    const data = (await res.json().catch(() => null)) as unknown;
    return { res, data, model };
  }

  const userMessage = await appendAiMessage({
    threadId,
    role: "user",
    content: parsed.data.prompt,
    attachments: storedAttachments,
  });

  await touchAiThread({
    threadId,
    title: existingThread?.title === "Nova conversa" || !existingThread?.title ? parsed.data.prompt.replace(/\s+/g, " ").trim().slice(0, 72) || "Nova conversa" : undefined,
    selectedTemplateSlug: templateSlug,
  });

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
    return NextResponse.json({ error: friendlyAiErrorMessage(message, attempt.res.status), model: attempt.model }, { status: attempt.res.status === 429 ? 429 : 502 });
  }

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> } | null)?.candidates?.[0]
    ?.content?.parts;
  const rawText = (parts ?? [])
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!rawText) return NextResponse.json({ error: "Resposta vazia" }, { status: 502 });

  const parsedJson = extractAssistantPayload(rawText);
  const isUsefulDocumentText = (text: string) => {
    const clean = text.trim();
    if (clean.length < 900) return false;
    if (/^segue o/i.test(clean)) return false;
    if (/^não consegui/i.test(clean)) return false;
    const headings = (clean.match(/^\s*(\d+\.|#+\s)/gm) ?? []).length;
    const clauses = (clean.match(/cl[aá]usula/gi) ?? []).length;
    return headings >= 4 || clauses >= 3;
  };

  function decodeTextFile(base64: string) {
    try {
      return Buffer.from(base64, "base64").toString("utf8");
    } catch {
      return "";
    }
  }

  function isTextualMimeType(mimeType: string) {
    const normalized = mimeType.toLowerCase().trim();
    return (
      normalized.startsWith("text/") ||
      normalized === "application/json" ||
      normalized === "application/xml" ||
      normalized === "application/xhtml+xml"
    );
  }

  function buildPdfFilename(sourceName?: string | null) {
    const base = (sourceName ?? "documento").trim().replace(/\.[^.]+$/, "") || "documento";
    return `${base}.pdf`;
  }

  function findPdfFile(files: AiStoredFile[]) {
    return files.find((file) => file.mimeType.toLowerCase() === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf")) ?? null;
  }

  function pickPdfSourceText(sourceText: string, files: AiStoredFile[]) {
    const textualFile = files.find((file) => isTextualMimeType(file.mimeType));
    if (textualFile) {
      const decoded = decodeTextFile(textualFile.base64).trim();
      if (decoded) return decoded;
    }
    return sourceText.trim();
  }

  if (parsedJson) {
    const json = parsedJson;
    let files = Array.isArray(json.files) ? json.files.slice(0, 3) : [];
    const documentText = documentMode
      ? normalizeAssistantDisplayText((json as { documentMarkdown?: string; text?: string }).documentMarkdown ?? json.text)
      : normalizeAssistantDisplayText(json.text);
    let responseText = documentMode ? "Segue o contrato em PDF." : normalizeAssistantDisplayText(json.text);

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

    const wantsPdf = documentMode || /\bpdf\b/i.test(parsed.data.prompt) || /\bdocumento\b/i.test(parsed.data.prompt) || /não consigo criar um arquivo pdf/i.test(documentText);

    if (documentMode && !isUsefulDocumentText(documentText)) {
      const strictAttempt = await callGemini(fallbackModel, true);
      if (strictAttempt.res.ok) {
        const strictParts = (strictAttempt.data as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> } | null)?.candidates?.[0]
          ?.content?.parts;
        const strictRawText = (strictParts ?? [])
          .map((p) => (typeof p?.text === "string" ? p.text : ""))
          .filter(Boolean)
          .join("\n")
          .trim();
        const strictParsed = strictRawText ? extractAssistantPayload(strictRawText) : null;
        if (strictParsed) {
          const strictDocumentText = normalizeAssistantDisplayText(
            (strictParsed as { documentMarkdown?: string; text?: string }).documentMarkdown ?? strictParsed.text,
          );
          if (isUsefulDocumentText(strictDocumentText)) {
            const strictFiles = Array.isArray(strictParsed.files) ? strictParsed.files.slice(0, 3) : [];
            const targetPdfBase = strictDocumentText;
            const base64 = await renderMarkdownPdfBase64(targetPdfBase);
            const nextFiles = [{ filename: "contrato.pdf", mimeType: "application/pdf", base64 }, ...strictFiles].slice(0, 3);
            const storedFiles: AiStoredFile[] = nextFiles.map((file) => ({
              filename: file.filename,
              mimeType: file.mimeType,
              base64: file.base64,
            }));
            const modelMessage = await appendAiMessage({
              threadId,
              role: "model",
              content: "Segue o contrato em PDF.",
              files: storedFiles,
            });
            await refreshAiThreadSummary(threadId);
            return NextResponse.json({ threadId: thread.id, text: "Segue o contrato em PDF.", files: nextFiles, userMessage, modelMessage });
          }
        }
      }

      const draft = buildServiceContractDraft(parsed.data.prompt);
      const base64 = await renderMarkdownPdfBase64(draft.text);
      const files = [{ filename: draft.filename, mimeType: "application/pdf", base64 }];
      const modelMessage = await appendAiMessage({
        threadId,
        role: "model",
        content: draft.responseText,
        files,
      });
      await refreshAiThreadSummary(threadId);
      return NextResponse.json({ threadId: thread.id, text: draft.responseText, files, userMessage, modelMessage });
    }

    if (wantsPdf) {
      const existingPdf = findPdfFile(files);
      if (!existingPdf) {
        const pdfSourceText = pickPdfSourceText(documentText, files);
        const base64 = await renderMarkdownPdfBase64(pdfSourceText);
        const pdfFilename = buildPdfFilename(json.outputFilename ?? files[0]?.filename ?? template?.template.name ?? "documento");
        files = [{ filename: pdfFilename, mimeType: "application/pdf", base64 }, ...files].slice(0, 3);
      }
      responseText = documentMode ? "Segue o contrato em PDF." : "Segue o PDF solicitado.";
    }

    const storedFiles: AiStoredFile[] = files.map((file) => ({
      filename: file.filename,
      mimeType: file.mimeType,
      base64: file.base64,
    }));
    const modelMessage = await appendAiMessage({
      threadId,
      role: "model",
      content: responseText,
      files: storedFiles,
    });
    await refreshAiThreadSummary(threadId);
    return NextResponse.json({ threadId: thread.id, text: responseText, files, userMessage, modelMessage });
  }

  // Fallback: treat as plain text.
  const wantsPdf = /\bpdf\b/i.test(parsed.data.prompt) || /\bdocumento\b/i.test(parsed.data.prompt) || /não consigo criar um arquivo pdf/i.test(rawText);
  if (wantsPdf) {
    const base64 = await renderMarkdownPdfBase64(rawText);
    const files = [{ filename: "documento.pdf", mimeType: "application/pdf", base64 }];
    const modelMessage = await appendAiMessage({
      threadId,
      role: "model",
      content: documentMode ? "Segue o contrato em PDF." : "Segue o PDF solicitado.",
      files,
    });
    await refreshAiThreadSummary(threadId);
    return NextResponse.json({ threadId: thread.id, text: documentMode ? "Segue o contrato em PDF." : "Segue o PDF solicitado.", files, userMessage, modelMessage });
  }

  const modelMessage = await appendAiMessage({
    threadId,
    role: "model",
    content: normalizeAssistantDisplayText(rawText),
  });
  await refreshAiThreadSummary(threadId);
  return NextResponse.json({ threadId: thread.id, text: normalizeAssistantDisplayText(rawText), userMessage, modelMessage });
});
