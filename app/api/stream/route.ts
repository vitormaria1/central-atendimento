import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { subscribe } from "@/lib/stream";

export const dynamic = "force-dynamic";

function encodeSse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(encodeSse(event)));
      send({ type: "hello" });

      const unsubscribe = subscribe((event) => send(event));

      const heartbeat = setInterval(() => send({ type: "ping", at: Date.now() }), 25_000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
      cleanup = null;
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
