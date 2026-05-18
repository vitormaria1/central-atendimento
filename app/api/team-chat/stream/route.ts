import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function encodeSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const querySchema = z.object({
  channel: z.string().optional(),
  sinceId: z.string().optional(),
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const channel = (parsed.data.channel ?? "geral").trim() || "geral";
  let lastId = parsed.data.sinceId ? Number.parseInt(parsed.data.sinceId, 10) : 0;
  if (!Number.isFinite(lastId)) lastId = 0;

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(encodeSse(event)));
      send({ type: "hello", channel });

      const heartbeat = setInterval(() => send({ type: "ping", at: Date.now() }), 25_000);

      void (async () => {
        try {
          while (!cancelled) {
            const { rows } = await dbQuery<{
              id: string;
              sender_name: string;
              body: string;
              created_at: string;
            }>(
              `
                select id::text, sender_name, body, created_at::text
                from team_chat_messages
                where channel = $1 and id > $2
                order by id asc
                limit 50
              `,
              [channel, lastId],
            );

            for (const row of rows) {
              const idNum = Number.parseInt(row.id, 10);
              if (Number.isFinite(idNum)) lastId = Math.max(lastId, idNum);
              send({
                type: "message",
                item: {
                  id: row.id,
                  channel,
                  senderName: row.sender_name,
                  body: row.body,
                  createdAt: row.created_at,
                },
              });
            }

            await sleep(1500);
          }
        } catch (err) {
          send({ type: "error", error: err instanceof Error ? err.message : "stream error" });
        } finally {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      })();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
