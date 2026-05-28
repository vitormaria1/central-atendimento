import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { dbQuery } from "@/lib/db";
import { getChatLabels, listChats, listLabels } from "@/lib/uazapi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function uniq(items: string[]) {
  return Array.from(new Set(items.map((s) => s.trim()).filter(Boolean)));
}

export const POST = withApi(async () => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const labels = await listLabels();
  for (const l of labels) {
    const id = (l.id ?? "").trim();
    const name = (l.name ?? "").trim();
    if (!id || !name) continue;
    await dbQuery(
      `
        insert into wa_labels (id, name, color)
        values ($1, $2, $3)
        on conflict (id) do update set
          name = excluded.name,
          color = excluded.color,
          updated_at = now()
      `,
      [id, name, (l.color ?? null) as string | null],
    );
  }

  const labelNameById = new Map<string, string>();
  for (const l of labels) {
    if (l.id && l.name) labelNameById.set(l.id, l.name);
  }

  // Import labels per chat (best-effort) – we only need enough to cover existing conversations.
  let offset = 0;
  const limit = 80;
  let updatedChats = 0;

  while (offset < 400) {
    const chats = await listChats({ limit, offset });
    if (!chats.length) break;

    for (const c of chats) {
      const chatId = (c.wa_chatid ?? c.wa_fastid ?? c.id ?? "").trim();
      if (!chatId) continue;

      let chatLabels: Array<{ id?: string; name?: string }> = [];
      try {
        chatLabels = await getChatLabels({ chatid: chatId });
      } catch {
        continue;
      }

      const labelNames = uniq(
        chatLabels
          .map((x) => (x.name ?? (x.id ? labelNameById.get(x.id) : "") ?? "").trim())
          .filter(Boolean),
      );

      if (labelNames.length === 0) continue;

      // Merge with existing tags to not lose manual tags.
      await dbQuery(
        `
          insert into chat_state (chat_id, status, assigned_agent_id, tags)
          values ($1, 'pendente', null, $2)
          on conflict (chat_id) do update set
            tags = (
              select array(
                select distinct x
                from unnest(chat_state.tags || excluded.tags) as x
                where x is not null and length(trim(x)) > 0
              )
            ),
            updated_at = now()
        `,
        [chatId, labelNames],
      );
      updatedChats += 1;
    }

    offset += chats.length;
    if (chats.length < limit) break;
  }

  return NextResponse.json({ ok: true, labels: labels.length, updatedChats });
});

