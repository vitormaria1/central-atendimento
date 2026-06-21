import { getEnv } from "./env";

type InterResponse = Record<string, unknown>;

async function interFetch<T extends InterResponse>(path: string, init: RequestInit = {}) {
  const { INTER_BASE_URL, INTER_CLIENT_ID, INTER_CLIENT_SECRET } = getEnv();
  if (!INTER_BASE_URL || !INTER_CLIENT_ID || !INTER_CLIENT_SECRET) {
    throw new Error("Banco Inter não configurado");
  }

  const res = await fetch(`${INTER_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "content-type": "application/json",
      "x-inter-client-id": INTER_CLIENT_ID,
      "x-inter-client-secret": INTER_CLIENT_SECRET,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Inter ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

export async function createInterBoleto(payload: {
  clientName: string;
  clientDocument?: string | null;
  amountCents: number;
  dueDate: string;
  description: string;
}) {
  return interFetch("/cobranca/v3/cobrancas", {
    method: "POST",
    body: JSON.stringify({
      nomeBeneficiario: payload.clientName,
      valorNominal: (payload.amountCents / 100).toFixed(2),
      dataVencimento: payload.dueDate,
      descricao: payload.description,
      documento: payload.clientDocument ?? undefined,
    }),
  });
}

