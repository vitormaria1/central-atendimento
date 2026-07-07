import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withApi } from "@/lib/api";
import { downloadMessage } from "@/lib/uazapi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilename(input: string) {
  const cleaned = input
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.trim();
  if (!cleaned) return "arquivo";
  return cleaned.replace(/[^\w.\-() ]+/g, "_").slice(0, 160) || "arquivo";
}

export const GET = withApi(async (_req: Request, ctx: RouteContext<"/api/messages/[messageId]/download">) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = await ctx.params;
  const id = decodeURIComponent(messageId);
  const url = new URL(_req.url);
  const raw = url.searchParams.get("raw") === "1" || url.searchParams.get("download") === "1";
  try {
    const data = await downloadMessage({ id, return_link: true, return_base64: raw });
    if (raw) {
      const base64Data = (data as { base64Data?: string }).base64Data?.trim();
      const mimetype = (data.mimetype ?? "application/octet-stream").trim() || "application/octet-stream";
      const fileURL = data.fileURL?.trim() ?? "";
      let bytes: Uint8Array | null = null;

      if (base64Data) {
        bytes = Buffer.from(base64Data, "base64");
      } else if (fileURL) {
        const mediaRes = await fetch(fileURL, { cache: "no-store" });
        if (!mediaRes.ok) {
          const message = `Failed to fetch media URL: ${mediaRes.status} ${mediaRes.statusText}`;
          return NextResponse.json({ error: "Failed to download media", details: message }, { status: 502 });
        }
        bytes = new Uint8Array(await mediaRes.arrayBuffer());
      }

      if (!bytes) {
        return NextResponse.json({ error: "Failed to download media", details: "Media payload unavailable" }, { status: 502 });
      }

      const filenameSource = fileURL || `message-${id}`;
      const filename = safeFilename(filenameSource);
      return new Response(bytes, {
        headers: {
          "content-type": mimetype,
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "private, no-store, max-age=0",
        },
      });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to download media", details: message }, { status: 502 });
  }
});
