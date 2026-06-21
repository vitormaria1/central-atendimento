"use client";

import { useEffect, useMemo, useState } from "react";
import { monthStartIso, todayIso } from "@/lib/finance";

type ClientItem = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  fiscalCity: string | null;
  fiscalState: string | null;
  invoiceEmail: string | null;
  serviceCode: string | null;
  serviceDescription: string | null;
  taxRegime: string | null;
};

const emptyInvoice = {
  clientId: "",
  competenceMonth: monthStartIso(),
  amount: "",
  serviceDescription: "",
  itemListaServico: "4.12",
  tomadorNome: "",
  tomadorDocumento: "",
  tomadorEmail: "",
  tomadorTelefone: "",
  tomadorLogradouro: "",
  tomadorNumero: "",
  tomadorComplemento: "",
  tomadorBairro: "",
  tomadorCidade: "",
  tomadorUf: "SC",
  tomadorCep: "",
  dataEmissao: todayIso(),
};

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm outline-none"
      />
    </label>
  );
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function FiscalInvoicePage() {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [invoice, setInvoice] = useState(emptyInvoice);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedClient = useMemo(() => clients.find((client) => client.id === invoice.clientId) ?? null, [clients, invoice.clientId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/clients?limit=200", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { items: ClientItem[] };
          setClients(data.items ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function applyClientPreset(clientId: string) {
    const client = clients.find((item) => item.id === clientId) ?? null;
    setInvoice((prev) => ({
      ...prev,
      clientId,
      tomadorNome: client?.name ?? "",
      tomadorDocumento: client?.document ?? "",
      tomadorEmail: client?.invoiceEmail ?? client?.email ?? "",
      tomadorTelefone: client?.whatsapp ?? client?.phone ?? "",
      tomadorLogradouro: client?.addressLine ?? "",
      tomadorNumero: client?.addressNumber ?? "",
      tomadorBairro: client?.neighborhood ?? "",
      tomadorCidade: client?.fiscalCity ?? client?.city ?? "",
      tomadorUf: client?.fiscalState ?? client?.state ?? "SC",
      tomadorCep: client?.zipCode ?? "",
      serviceDescription: client?.serviceDescription ?? prev.serviceDescription,
      itemListaServico: client?.serviceCode ?? prev.itemListaServico,
    }));
  }

  async function saveInvoice() {
    if (!invoice.clientId) {
      setToast("Selecione um cliente.");
      return;
    }

    setSaving(true);
    setToast(null);
    try {
      const res = await fetch("/api/fiscal/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: Number(invoice.clientId),
          competenceMonth: invoice.competenceMonth,
          amountCents: invoice.amount ? Math.round(Number.parseFloat(invoice.amount.replace(",", ".")) * 100) : undefined,
          serviceDescription: invoice.serviceDescription || null,
          itemListaServico: invoice.itemListaServico || null,
          tomadorNome: invoice.tomadorNome || null,
          tomadorDocumento: invoice.tomadorDocumento || null,
          tomadorEmail: invoice.tomadorEmail || null,
          tomadorTelefone: invoice.tomadorTelefone || null,
          tomadorLogradouro: invoice.tomadorLogradouro || null,
          tomadorNumero: invoice.tomadorNumero || null,
          tomadorComplemento: invoice.tomadorComplemento || null,
          tomadorBairro: invoice.tomadorBairro || null,
          tomadorCidade: invoice.tomadorCidade || null,
          tomadorUf: invoice.tomadorUf || null,
          tomadorCep: invoice.tomadorCep || null,
        }),
      });
      if (!res.ok) throw new Error("Falha ao gerar nota");
      setToast("Nota gerada.");
      setInvoice(emptyInvoice);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao gerar nota");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Emissão de nota</div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Nova NFS.</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Abra a tela, selecione o cliente e complete os dados da emissão.</p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando clientes...</div>
      ) : null}

      {toast ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{toast}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="grid gap-3 md:grid-cols-2">
            <select value={invoice.clientId} onChange={(e) => applyClientPreset(e.target.value)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm">
              <option value="">Selecionar cliente</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <Field label="Competência" value={invoice.competenceMonth} onChange={(v) => setInvoice((prev) => ({ ...prev, competenceMonth: v }))} />
            <Field label="Valor" value={invoice.amount} onChange={(v) => setInvoice((prev) => ({ ...prev, amount: v }))} placeholder="Ex.: 2500,00" />
            <Field label="Item" value={invoice.itemListaServico} onChange={(v) => setInvoice((prev) => ({ ...prev, itemListaServico: v }))} />
            <Field label="Data" value={invoice.dataEmissao} onChange={(v) => setInvoice((prev) => ({ ...prev, dataEmissao: v }))} />
            <textarea
              value={invoice.serviceDescription}
              onChange={(e) => setInvoice((prev) => ({ ...prev, serviceDescription: e.target.value }))}
              placeholder="Descrição do serviço"
              className="min-h-[88px] rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm md:col-span-2"
            />
            <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
              <Field label="Nome" value={invoice.tomadorNome} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorNome: v }))} />
              <Field label="Documento" value={invoice.tomadorDocumento} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorDocumento: v }))} />
              <Field label="E-mail" value={invoice.tomadorEmail} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorEmail: v }))} />
              <Field label="Telefone" value={invoice.tomadorTelefone} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorTelefone: v }))} />
              <Field label="Logradouro" value={invoice.tomadorLogradouro} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorLogradouro: v }))} />
              <Field label="Número" value={invoice.tomadorNumero} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorNumero: v }))} />
              <Field label="Bairro" value={invoice.tomadorBairro} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorBairro: v }))} />
              <Field label="Cidade" value={invoice.tomadorCidade} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorCidade: v }))} />
              <Field label="UF" value={invoice.tomadorUf} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorUf: v }))} />
              <Field label="CEP" value={invoice.tomadorCep} onChange={(v) => setInvoice((prev) => ({ ...prev, tomadorCep: v }))} />
            </div>
            <input
              value={invoice.tomadorComplemento}
              onChange={(e) => setInvoice((prev) => ({ ...prev, tomadorComplemento: e.target.value }))}
              placeholder="Complemento"
              className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm md:col-span-2"
            />
            <button
              type="button"
              onClick={() => void saveInvoice()}
              disabled={saving}
              className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60 md:col-span-2"
            >
              {saving ? "Gerando..." : "Gerar nota"}
            </button>
          </div>
        </section>

        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Cliente selecionado</div>
          <div className="mt-1 text-xl font-semibold">{selectedClient?.name ?? "Selecione um cliente"}</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Documento</div>
              <div className="mt-1 font-medium">{selectedClient?.document ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Município fiscal</div>
              <div className="mt-1 font-medium">{selectedClient?.fiscalCity && selectedClient?.fiscalState ? `${selectedClient.fiscalCity}/${selectedClient.fiscalState}` : "—"}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Regime</div>
              <div className="mt-1 font-medium">{selectedClient?.taxRegime ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">E-mail</div>
              <div className="mt-1 font-medium">{selectedClient?.invoiceEmail ?? "—"}</div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Serviço</div>
              <div className="mt-1 font-medium">{selectedClient?.serviceDescription ?? "—"}</div>
            </div>
            <div className="text-xs text-[var(--muted)]">Data de emissão padrão: {formatDate(invoice.dataEmissao)}</div>
          </div>
        </section>
      </div>
    </section>
  );
}
