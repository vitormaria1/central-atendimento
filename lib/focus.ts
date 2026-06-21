import { getEnv } from "./env";

type FocusResponse = Record<string, unknown>;

async function focusFetch<T extends FocusResponse>(path: string, init: RequestInit = {}) {
  const { FOCUS_BASE_URL, FOCUS_API_KEY } = getEnv();
  if (!FOCUS_BASE_URL || !FOCUS_API_KEY) {
    throw new Error("Focus NFe não configurado");
  }

  const res = await fetch(`${FOCUS_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Basic ${Buffer.from(`${FOCUS_API_KEY}:`).toString("base64")}`,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Focus ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

export async function createFocusInvoice(payload: {
  clientName: string;
  clientDocument?: string | null;
  serviceDescription: string;
  amountCents: number;
  competenceMonth: string;
}) {
  return focusFetch("/v3/nfe", {
    method: "POST",
    body: JSON.stringify({
      invoice: {
        customer: {
          name: payload.clientName,
          document: payload.clientDocument ?? undefined,
        },
        service_description: payload.serviceDescription,
        amount: (payload.amountCents / 100).toFixed(2),
        competence_month: payload.competenceMonth,
      },
    }),
  });
}

