"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { monthStartIso, todayIso } from "@/lib/finance";

type ClientItem = {
  id: string;
  name: string;
  legalName: string | null;
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

type ContractItem = {
  id: string;
  clientId: string;
  clientName: string;
  status: "draft" | "active" | "paused" | "closed";
  monthlyFeeCents: number;
  dueDay: number;
  billingEmail: string | null;
  billingWhatsapp: string | null;
  sendEmail: boolean;
  sendWhatsapp: boolean;
  generateInvoice: boolean;
  generateBoleto: boolean;
  invoiceServiceCode: string | null;
  invoiceServiceDescription: string | null;
  notes: string | null;
};

type FiscalInvoiceItem = {
  id: string;
  competenceMonth: string | null;
  dueDate: string | null;
  amountCents: number;
  invoiceStatus: string;
  boletoStatus: string;
  paymentStatus: string;
  emailStatus: string;
  whatsappStatus: string;
  focusInvoiceId: string | null;
  focusInvoiceNumber: string | null;
  focusInvoiceUrl: string | null;
  boletoUrl: string | null;
  boletoBarcode: string | null;
  sourceLabel: string;
  notes: string | null;
  clientName: string;
  updatedAt: string;
};

type Overview = {
  metrics: {
    activeContracts: number;
    invoiceReady: number;
    cyclesPending: number;
    servicesActive: number;
    nextCompetenceMonth: string;
  };
  contracts: ContractItem[];
  services: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    active: boolean;
    municipalCode: string | null;
    cnae: string | null;
    taxRegime: string | null;
    updatedAt: string;
  }>;
};

type InvoicePayload = {
  clientId: string;
  competenceMonth: string;
  amount: string;
  serviceDescription: string;
  itemListaServico: string;
  tomadorNome: string;
  tomadorDocumento: string;
  tomadorEmail: string;
  tomadorTelefone: string;
  tomadorLogradouro: string;
  tomadorNumero: string;
  tomadorComplemento: string;
  tomadorBairro: string;
  tomadorCidade: string;
  tomadorUf: string;
  tomadorCep: string;
  dataEmissao: string;
};

const emptyInvoice: InvoicePayload = {
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const classes =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700"
        : tone === "danger"
          ? "border-red-500/20 bg-red-500/10 text-red-700"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes}`}>{children}</span>;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function readiness(client: ClientItem | null, contract: ContractItem | null) {
  const checks = [
    Boolean(client?.document),
    Boolean(client?.fiscalCity && client?.fiscalState),
    Boolean(client?.invoiceEmail),
    Boolean(client?.serviceCode),
    Boolean(contract?.status === "active"),
    Boolean(contract?.generateInvoice),
  ];
  return {
    total: checks.length,
    passed: checks.filter(Boolean).length,
    checks,
  };
}

export default function FiscalInvoicePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [items, setItems] = useState<FiscalInvoiceItem[]>([]);
  const [invoice, setInvoice] = useState(emptyInvoice);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "issued" | "failed" | "paid">("all");

  const selectedClient = useMemo(() => clients.find((client) => client.id === invoice.clientId) ?? null, [clients, invoice.clientId]);
  const selectedContract = useMemo(
    () => overview?.contracts.find((contract) => contract.clientId === invoice.clientId) ?? null,
    [overview, invoice.clientId],
  );
  const queue = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return item.invoiceStatus === "pending" || item.paymentStatus === "open";
      if (statusFilter === "paid") return item.paymentStatus === "paid";
      return item.invoiceStatus === statusFilter;
    });
  }, [items, statusFilter]);
  const readinessState = readiness(selectedClient, selectedContract);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [clientsRes, overviewRes, invoicesRes] = await Promise.all([
          fetch("/api/clients?limit=200", { cache: "no-store" }),
          fetch("/api/fiscal/overview", { cache: "no-store" }),
          fetch("/api/fiscal/invoices?limit=60", { cache: "no-store" }),
        ]);

        if (clientsRes.ok) {
          const data = (await clientsRes.json()) as { items: ClientItem[] };
          setClients(data.items ?? []);
        }
        if (overviewRes.ok) setOverview((await overviewRes.json()) as Overview);
        if (invoicesRes.ok) {
          const data = (await invoicesRes.json()) as { items: FiscalInvoiceItem[] };
          setItems(data.items ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function applyClientPreset(clientId: string) {
    const client = clients.find((item) => item.id === clientId) ?? null;
    const contract = overview?.contracts.find((item) => item.clientId === clientId) ?? null;
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
      serviceDescription: contract?.invoiceServiceDescription ?? client?.serviceDescription ?? prev.serviceDescription,
      itemListaServico: contract?.invoiceServiceCode ?? client?.serviceCode ?? prev.itemListaServico,
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
      const invoicesRes = await fetch("/api/fiscal/invoices?limit=60", { cache: "no-store" });
      if (invoicesRes.ok) {
        const data = (await invoicesRes.json()) as { items: FiscalInvoiceItem[] };
        setItems(data.items ?? []);
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao gerar nota");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Emissão de nota</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Nova NFS</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Selecione o cliente, valide os dados e acompanhe a fila de emissão.</p>
        </div>
        <Link href="/fiscal" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
          Voltar ao painel
        </Link>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando...</div> : null}
      {toast ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{toast}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Prontas para emitir" value={`${overview?.metrics.invoiceReady ?? 0}`} />
        <Stat label="Emitidas" value={`${items.filter((item) => item.invoiceStatus === "issued").length}`} />
        <Stat label="Falhas" value={`${items.filter((item) => item.invoiceStatus === "failed").length}`} />
        <Stat label="Pagas" value={`${items.filter((item) => item.paymentStatus === "paid").length}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Preparar emissão</div>
          <div className="mt-1 text-xl font-semibold">Dados da NFS</div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
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
              className="min-h-[96px] rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm md:col-span-2"
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

        <section className="space-y-4">
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Checklist</div>
            <div className="mt-1 text-xl font-semibold">Prontidão do cliente</div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Documento", ok: Boolean(selectedClient?.document) },
                { label: "Município fiscal", ok: Boolean(selectedClient?.fiscalCity && selectedClient?.fiscalState) },
                { label: "E-mail de nota", ok: Boolean(selectedClient?.invoiceEmail) },
                { label: "Código do serviço", ok: Boolean(selectedClient?.serviceCode || selectedContract?.invoiceServiceCode) },
                { label: "Contrato ativo", ok: Boolean(selectedContract?.status === "active") },
                { label: "Emissão habilitada", ok: Boolean(selectedContract?.generateInvoice) },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <span className="text-sm font-medium">{item.label}</span>
                  <Badge tone={item.ok ? "success" : "danger"}>{item.ok ? "OK" : "Pendente"}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
              {readinessState.passed}/{readinessState.total} itens prontos para emissão.
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Cliente selecionado</div>
            <div className="mt-1 text-xl font-semibold">{selectedClient?.name ?? "Selecione um cliente"}</div>
            <div className="mt-4 space-y-3 text-sm">
              <InfoRow label="Contrato" value={selectedContract?.status ?? "—"} />
              <InfoRow label="Honorário" value={money(selectedContract?.monthlyFeeCents ?? 0)} />
              <InfoRow label="Vencimento" value={selectedContract?.dueDay ? `Dia ${selectedContract.dueDay}` : "—"} />
              <InfoRow label="Município fiscal" value={selectedClient?.fiscalCity && selectedClient?.fiscalState ? `${selectedClient.fiscalCity}/${selectedClient.fiscalState}` : "—"} />
              <InfoRow label="Regime" value={selectedClient?.taxRegime ?? "—"} />
              <InfoRow label="E-mail" value={selectedClient?.invoiceEmail ?? "—"} />
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Fila operacional</div>
            <div className="mt-1 text-xl font-semibold">Notas recentes</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setStatusFilter("all")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Todas
            </button>
            <button type="button" onClick={() => setStatusFilter("pending")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Pendentes
            </button>
            <button type="button" onClick={() => setStatusFilter("issued")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Emitidas
            </button>
            <button type="button" onClick={() => setStatusFilter("failed")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Falhas
            </button>
            <button type="button" onClick={() => setStatusFilter("paid")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Pagas
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {queue.length ? (
            queue.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{item.clientName}</div>
                    <div className="text-xs text-[var(--muted)]">{item.sourceLabel}</div>
                  </div>
                  <div className="text-sm font-semibold">{money(item.amountCents)}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={item.invoiceStatus === "issued" ? "success" : item.invoiceStatus === "failed" ? "danger" : "warning"}>{item.invoiceStatus}</Badge>
                  <Badge tone={item.paymentStatus === "paid" ? "success" : "neutral"}>{item.paymentStatus}</Badge>
                  <Badge tone={item.boletoStatus === "issued" ? "success" : item.boletoStatus === "failed" ? "danger" : "warning"}>{item.boletoStatus}</Badge>
                  <Badge tone={item.emailStatus === "sent" ? "success" : "neutral"}>{item.emailStatus}</Badge>
                  <Badge tone={item.whatsappStatus === "sent" ? "success" : "neutral"}>{item.whatsappStatus}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] md:grid-cols-2 xl:grid-cols-4">
                  <div>Competência: {item.competenceMonth ?? "—"}</div>
                  <div>Vencimento: {item.dueDate ?? "—"}</div>
                  <div>Atualizado: {formatDate(item.updatedAt)}</div>
                  <div>{item.focusInvoiceNumber ? `NFS ${item.focusInvoiceNumber}` : "Sem número ainda"}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.focusInvoiceUrl ? (
                    <a href={item.focusInvoiceUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium">
                      Abrir nota
                    </a>
                  ) : null}
                  {item.boletoUrl ? (
                    <a href={item.boletoUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium">
                      Abrir boleto
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
              Nenhuma nota encontrada.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="text-right text-sm font-medium">{value}</div>
    </div>
  );
}
