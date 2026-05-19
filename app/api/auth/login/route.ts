import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi } from "@/lib/api";
import { createSessionCookie, setSessionCookie } from "@/lib/auth";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  agentId: z.enum(["vanderlei", "gustavo"]),
  pin: z.string().min(1),
});

export const POST = withApi(async (req: Request) => {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const env = getEnv();
  const expectedPin =
    parsed.data.agentId === "vanderlei" ? env.AGENT_VANDERLEI_PIN : env.AGENT_GUSTAVO_PIN;

  if (parsed.data.pin !== expectedPin) {
    return NextResponse.json({ error: "PIN inválido" }, { status: 401 });
  }

  const agentName = parsed.data.agentId === "vanderlei" ? "Vanderlei" : "Gustavo";
  const token = await createSessionCookie({ agentId: parsed.data.agentId, agentName });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
});
