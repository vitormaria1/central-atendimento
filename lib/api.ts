import { NextResponse } from "next/server";
import { log, newRequestId } from "@/lib/logger";

export function withApi<C = unknown>(handler: (req: Request, ctx: C) => Promise<Response> | Response) {
  return async function wrapped(req: Request, ctx: C) {
    const requestId = newRequestId();
    const startedAt = Date.now();

    try {
      const res = await handler(req, ctx);
      const next = new Response(res.body, res);
      next.headers.set("x-request-id", requestId);

      const ms = Date.now() - startedAt;
      log("info", "api.request", {
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        status: next.status,
        ms,
      });
      return next;
    } catch (err) {
      const ms = Date.now() - startedAt;
      log("error", "api.error", {
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        ms,
        error: err instanceof Error ? err.message : String(err),
      });

      return NextResponse.json({ error: "Erro interno", requestId }, { status: 500, headers: { "x-request-id": requestId } });
    }
  };
}
