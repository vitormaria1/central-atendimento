import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";
import { listChats } from "@/lib/uazapi";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

type ChatStateRow = {
  chat_id: string;
  status: "pendente" | "resolvido";
  assigned_agent_id: string | null;
  tags: string[];
  updated_at: string;
};

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const chats = await listChats(parsed.data);
  const chatIds = chats
    .map((c) => c.wa_chatid ?? c.wa_fastid ?? c.id)
    .filter((v): v is string => Boolean(v));

  const states: ChatStateRow[] =
    chatIds.length === 0
      ? []
      : (
          await dbQuery<ChatStateRow>(
            "select chat_id, status, assigned_agent_id, tags, updated_at from chat_state where chat_id = any($1::text[])",
            [chatIds],
          )
        ).rows;

  const stateById = new Map<string, ChatStateRow>(states.map((s) => [s.chat_id, s]));

  const result = chats.map((chat) => {
    const chatId = chat.wa_chatid ?? chat.wa_fastid ?? chat.id ?? "";
    const state = chatId ? stateById.get(chatId) : undefined;
    return {
      chatId,
      name: chat.wa_name ?? chat.name ?? "Sem nome",
      isGroup: Boolean(chat.wa_isGroup),
      unreadCount: chat.wa_unreadCount ?? 0,
      lastMsgTimestamp: chat.wa_lastMsgTimestamp ?? null,
      lastMessageText: chat.wa_lastMessageTextVote ?? "",
      state: state
        ? {
            status: state.status,
            assignedAgentId: state.assigned_agent_id,
            tags: state.tags ?? [],
            updatedAt: state.updated_at,
          }
        : null,
    };
  });

  return NextResponse.json({ items: result });
}
