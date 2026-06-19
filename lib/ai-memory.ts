import { normalizeAssistantDisplayText } from "@/lib/ai-output";
import { dbQuery } from "@/lib/db";

export type AiStoredAttachment = {
  name: string;
  mimeType: string;
  dataBase64?: string;
  sizeBytes?: number;
};

export type AiStoredFile = {
  filename: string;
  mimeType: string;
  base64: string;
};

export type AiThread = {
  id: string;
  title: string;
  summary: string;
  selectedTemplateSlug: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageText: string | null;
};

export type AiThreadMessage = {
  id: string;
  role: "user" | "model";
  text: string;
  attachments: AiStoredAttachment[];
  files: AiStoredFile[];
  createdAt: string;
};

function normalizeTitle(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (!clean) return "Nova conversa";
  return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean;
}

function toSummaryLine(role: "user" | "model", content: string) {
  const label = role === "user" ? "Usuário" : "J.U.S.S.A.R.A.";
  const clean = content.replace(/\s+/g, " ").trim();
  return `${label}: ${clean}`;
}

export async function createAiThread(agentId: "vanderlei" | "gustavo", seedPrompt?: string) {
  const title = normalizeTitle(seedPrompt ?? "");
  const { rows } = await dbQuery<{ id: string; title: string; summary: string; selected_template_slug: string | null; created_at: string; updated_at: string }>(
    `
      insert into ai_threads (agent_id, title)
      values ($1, $2)
      returning id::text, title, summary, selected_template_slug, created_at::text, updated_at::text
    `,
    [agentId, title],
  );
  const row = rows[0]!;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    selectedTemplateSlug: row.selected_template_slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageText: null,
  } satisfies AiThread;
}

export async function listAiThreads(agentId: "vanderlei" | "gustavo") {
  const { rows } = await dbQuery<{
    id: string;
    title: string;
    summary: string;
    selected_template_slug: string | null;
    created_at: string;
    updated_at: string;
    last_message_text: string | null;
  }>(
    `
      select
        t.id::text,
        t.title,
        t.summary,
        t.selected_template_slug,
        t.created_at::text,
        t.updated_at::text,
        (
          select m.content
          from ai_messages m
          where m.thread_id = t.id
          order by m.id desc
          limit 1
        ) as last_message_text
      from ai_threads t
      where t.agent_id = $1
      order by t.updated_at desc, t.id desc
      limit 40
    `,
    [agentId],
  );

  return rows.map(
    (row) =>
      ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        selectedTemplateSlug: row.selected_template_slug,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageText: row.last_message_text ? normalizeAssistantDisplayText(row.last_message_text) : null,
      }) satisfies AiThread,
  );
}

export async function getAiThread(agentId: "vanderlei" | "gustavo", threadId: number) {
  const { rows } = await dbQuery<{
    id: string;
    title: string;
    summary: string;
    selected_template_slug: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `
      select id::text, title, summary, selected_template_slug, created_at::text, updated_at::text
      from ai_threads
      where id = $1 and agent_id = $2
      limit 1
    `,
    [threadId, agentId],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    selectedTemplateSlug: row.selected_template_slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageText: null,
  } satisfies AiThread;
}

export async function listAiMessages(threadId: number, limit = 80) {
  const { rows } = await dbQuery<{
    id: string;
    role: "user" | "model";
    content: string;
    attachments: unknown;
    files: unknown;
    created_at: string;
  }>(
    `
      select id::text, role, content, attachments, files, created_at::text
      from ai_messages
      where thread_id = $1
      order by id asc
      limit $2
    `,
    [threadId, limit],
  );

  return rows.map(
    (row) =>
      ({
        id: row.id,
        role: row.role,
        text: row.role === "model" ? normalizeAssistantDisplayText(row.content) : row.content,
        attachments: Array.isArray(row.attachments) ? (row.attachments as AiStoredAttachment[]) : [],
        files: Array.isArray(row.files) ? (row.files as AiStoredFile[]) : [],
        createdAt: row.created_at,
      }) satisfies AiThreadMessage,
  );
}

export async function appendAiMessage(params: {
  threadId: number;
  role: "user" | "model";
  content: string;
  attachments?: AiStoredAttachment[];
  files?: AiStoredFile[];
}) {
  const { rows } = await dbQuery<{
    id: string;
    role: "user" | "model";
    content: string;
    attachments: unknown;
    files: unknown;
    created_at: string;
  }>(
    `
      insert into ai_messages (thread_id, role, content, attachments, files)
      values ($1, $2, $3, $4::jsonb, $5::jsonb)
      returning id::text, role, content, attachments, files, created_at::text
    `,
    [
      params.threadId,
      params.role,
      params.role === "model" ? normalizeAssistantDisplayText(params.content) : params.content,
      JSON.stringify(params.attachments ?? []),
      JSON.stringify(params.files ?? []),
    ],
  );

  const row = rows[0]!;
  return {
    id: row.id,
    role: row.role,
    text: row.role === "model" ? normalizeAssistantDisplayText(row.content) : row.content,
    attachments: Array.isArray(row.attachments) ? (row.attachments as AiStoredAttachment[]) : [],
    files: Array.isArray(row.files) ? (row.files as AiStoredFile[]) : [],
    createdAt: row.created_at,
  } satisfies AiThreadMessage;
}

export async function touchAiThread(params: {
  threadId: number;
  title?: string;
  summary?: string;
  selectedTemplateSlug?: string | null;
}) {
  const setParts: string[] = [];
  const values: unknown[] = [];
  const setField = (field: string, value: unknown) => {
    values.push(value);
    setParts.push(`${field} = $${values.length}`);
  };

  if (params.title !== undefined) setField("title", params.title);
  if (params.summary !== undefined) setField("summary", params.summary);
  if (params.selectedTemplateSlug !== undefined) setField("selected_template_slug", params.selectedTemplateSlug);
  if (setParts.length === 0) return;
  values.push(params.threadId);

  await dbQuery(
    `
      update ai_threads
      set ${setParts.join(", ")}
      where id = $${values.length}
    `,
    values,
  );
}

export async function buildAiContext(threadId: number) {
  const messages = await listAiMessages(threadId, 120);
  const recent = messages.slice(-16);
  const older = messages.slice(0, Math.max(0, messages.length - recent.length));
  const olderSummary = older
    .map((item) => toSummaryLine(item.role, item.text))
    .join("\n")
    .slice(-5000);

  const recentHistory = recent.map((item) => ({
    role: item.role,
    text: normalizeAssistantDisplayText(item.text),
  }));

  return {
    recentHistory,
    olderSummary,
  };
}

export async function refreshAiThreadSummary(threadId: number) {
  const messages = await listAiMessages(threadId, 120);
  const summary = messages
    .slice(-24)
    .map((item) => toSummaryLine(item.role, item.text))
    .join("\n")
    .slice(-6000);
  await touchAiThread({ threadId, summary });
}
