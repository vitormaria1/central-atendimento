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
  return createFocusNfse({
    prestador: {
      cnpj: "",
      inscricaoMunicipal: "",
      codigoMunicipio: 4205704,
    },
    tomador: {
      nome: payload.clientName,
      documento: payload.clientDocument ?? "",
      endereco: {
        logradouro: "",
        numero: "",
        bairro: "",
        codigoMunicipio: 4205704,
        uf: "SC",
        cep: "",
      },
    },
    servico: {
      discriminacao: payload.serviceDescription,
      valorServicosCents: payload.amountCents,
      itemListaServico: "4.12",
    },
    dataEmissao: payload.competenceMonth,
  });
}

export async function createFocusNfse(payload: {
  prestador: {
    cnpj: string;
    inscricaoMunicipal: string;
    codigoMunicipio: number;
  };
  tomador: {
    nome: string;
    documento: string;
    email?: string | null;
    telefone?: string | null;
    endereco: {
      logradouro: string;
      numero: string;
      bairro: string;
      codigoMunicipio: number;
      uf: string;
      cep: string;
      complemento?: string | null;
    };
  };
  servico: {
    discriminacao: string;
    valorServicosCents: number;
    itemListaServico: string;
    aliquota?: number | null;
    issRetido?: boolean | null;
  };
  naturezaOperacao?: number;
  optanteSimplesNacional?: boolean;
  dataEmissao?: string;
}) {
  return focusFetch("/v3/nfe", {
    method: "POST",
    body: JSON.stringify({
      data_emissao: payload.dataEmissao ?? new Date().toISOString(),
      natureza_operacao: payload.naturezaOperacao ?? 1,
      optante_simples_nacional: payload.optanteSimplesNacional ?? false,
      prestador: {
        cnpj: payload.prestador.cnpj,
        inscricao_municipal: payload.prestador.inscricaoMunicipal,
        codigo_municipio: payload.prestador.codigoMunicipio,
      },
      tomador: {
        cnpj: payload.tomador.documento || undefined,
        razao_social: payload.tomador.nome,
        endereco: {
          logradouro: payload.tomador.endereco.logradouro,
          numero: payload.tomador.endereco.numero,
          complemento: payload.tomador.endereco.complemento || undefined,
          bairro: payload.tomador.endereco.bairro,
          codigo_municipio: payload.tomador.endereco.codigoMunicipio,
          uf: payload.tomador.endereco.uf,
          cep: payload.tomador.endereco.cep,
        },
        telefone: payload.tomador.telefone || undefined,
        email: payload.tomador.email || undefined,
      },
      servico: {
        discriminacao: payload.servico.discriminacao,
        valor_servicos: (payload.servico.valorServicosCents / 100).toFixed(2),
        aliquota: payload.servico.aliquota ?? undefined,
        item_lista_servico: payload.servico.itemListaServico,
        iss_retido: payload.servico.issRetido ?? false,
      },
    }),
  });
}
