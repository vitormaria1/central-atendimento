"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { monthLabel } from "@/lib/finance";

type Overview = {
  metrics: {
    activeContracts: number;
    invoiceReady: number;
    cyclesPending: number;
    servicesActive: number;
    nextCompetenceMonth: string;
  };
  contracts: Array<{
    id: string;
    clientId: string;
    clientName: string;
    status: string;
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
  }>;
  services: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    active: boolean;
    municipalCode: string | null;
    cnae: string | null;
    taxRegime: string | null;
  }>;
  cycles: Array<{
    id: string;
    competenceMonth: string;
    status: string;
    itemCount: number;
    totalCents: number;
  }>;
};

type InvoiceItem = {
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
  sourceLabel: string;
  clientName: string;
  updatedAt: string;
};

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const classes =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700"
        : tone === "danger"
          ? "border-red-500/20 bg-red-500/10 text-red-700"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes}`}>{label}</span>;
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function FiscalReportsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceFilter, setInvoiceFilter] = useState<"all" | "pending" | "issued" | "failed" | "paid">("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [overviewRes, invoicesRes] = await Promise.all([
          fetch("/api/fiscal/overview", { cache: "no-store" }),
          fetch("/api/fiscal/invoices?limit=60", { cache: "no-store" }),
        ]);
        if (overviewRes.ok) setOverview((await overviewRes.json()) as Overview);
        if (invoicesRes.ok) {
          const data = (await invoicesRes.json()) as { items: InvoiceItem[] };
          setInvoices(data.items ?? []);
        }
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const reportMetrics = useMemo(() => {
    const contracts = overview?.contracts ?? [];
    const cycles = overview?.cycles ?? [];
    const items = invoices ?? [];
    const activeContracts = contracts.filter((contract) => contract.status === "active").length;
    const readyContracts = contracts.filter((contract) => contract.status === "active" && contract.generateInvoice).length;
    const billingConfigured = contracts.filter((contract) => contract.billingEmail || contract.billingWhatsapp).length;
    const totalMonthly = contracts.reduce((sum, contract) => sum + contract.monthlyFeeCents, 0);
    const openInvoices = items.filter((item) => item.paymentStatus === "open").reduce((sum, item) => sum + item.amountCents, 0);
    const paidInvoices = items.filter((item) => item.paymentStatus === "paid").reduce((sum, item) => sum + item.amountCents, 0);
    const failedInvoices = items.filter((item) => item.invoiceStatus === "failed" || item.boletoStatus === "failed").length;
    const cyclesPending = cycles.filter((cycle) => cycle.status === "pending" || cycle.status === "processing").length;

    return {
      activeContracts,
      readyContracts,
      billingConfigured,
      totalMonthly,
      openInvoices,
      paidInvoices,
      failedInvoices,
      cyclesPending,
    };
  }, [invoices, overview]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((item) => {
      if (invoiceFilter === "all") return true;
      if (invoiceFilter === "pending") return item.invoiceStatus === "pending" || item.paymentStatus === "open";
      if (invoiceFilter === "paid") return item.paymentStatus === "paid";
      return item.invoiceStatus === invoiceFilter;
    });
  }, [invoices, invoiceFilter]);

  const topContracts = useMemo(() => {
    return (overview?.contracts ?? [])
      .filter((contract) => contract.status === "active")
      .slice(0, 5);
  }, [overview]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Relatórios</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Painel fiscal</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Consolidação de contratos, emissão, ciclos e pendências do escritório.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/fiscal/invoice" className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
            Emitir NFS
          </Link>
          <Link href="/fiscal" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Painel
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando...</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Faturamento mensal" value={money(reportMetrics.totalMonthly)} hint={`${reportMetrics.activeContracts} contratos ativos`} />
        <Stat label="Prontos para emissão" value={`${reportMetrics.readyContracts}`} hint={`${reportMetrics.billingConfigured} com contato configurado`} />
        <Stat label="Em aberto" value={money(reportMetrics.openInvoices)} hint={`${reportMetrics.failedInvoices} falhas na fila`} />
        <Stat label="Recebido" value={money(reportMetrics.paidInvoices)} hint={`${reportMetrics.cyclesPending} ciclos pendentes`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Fila fiscal</div>
              <div className="mt-1 text-xl font-semibold">Notas recentes</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setInvoiceFilter("all")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
                Todas
              </button>
              <button type="button" onClick={() => setInvoiceFilter("pending")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
                Pendentes
              </button>
              <button type="button" onClick={() => setInvoiceFilter("issued")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
                Emitidas
              </button>
              <button type="button" onClick={() => setInvoiceFilter("failed")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
                Falhas
              </button>
              <button type="button" onClick={() => setInvoiceFilter("paid")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
                Pagas
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredInvoices.length ? (
              filteredInvoices.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.clientName}</div>
                      <div className="text-xs text-[var(--muted)]">{item.sourceLabel}</div>
                    </div>
                    <div className="text-sm font-semibold">{money(item.amountCents)}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge label={item.invoiceStatus} tone={item.invoiceStatus === "failed" ? "danger" : item.invoiceStatus === "issued" ? "success" : "warning"} />
                    <Badge label={item.paymentStatus} tone={item.paymentStatus === "paid" ? "success" : "neutral"} />
                    <Badge label={item.boletoStatus} tone={item.boletoStatus === "failed" ? "danger" : item.boletoStatus === "issued" ? "success" : "warning"} />
                    <Badge label={item.emailStatus} tone={item.emailStatus === "sent" ? "success" : "neutral"} />
                    <Badge label={item.whatsappStatus} tone={item.whatsappStatus === "sent" ? "success" : "neutral"} />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] md:grid-cols-2 xl:grid-cols-4">
                    <div>Competência: {item.competenceMonth ?? "—"}</div>
                    <div>Vencimento: {item.dueDate ?? "—"}</div>
                    <div>Atualizado: {new Date(item.updatedAt).toLocaleString("pt-BR")}</div>
                    <div>{item.focusInvoiceNumber ? `NFS ${item.focusInvoiceNumber}` : "Sem número"}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Nenhuma nota encontrada.</div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Ciclos</div>
            <div className="mt-1 text-xl font-semibold">Resumo por competência</div>
            <div className="mt-4 space-y-3">
              {(overview?.cycles ?? []).slice(0, 5).map((cycle) => (
                <div key={cycle.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{monthLabel(cycle.competenceMonth)}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {cycle.status} • {cycle.itemCount} itens
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{money(cycle.totalCents)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Contratos prioritários</div>
            <div className="mt-1 text-xl font-semibold">Base ativa</div>
            <div className="mt-4 space-y-3">
              {topContracts.length ? (
                topContracts.map((contract) => (
                  <div key={contract.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{contract.clientName}</div>
                        <div className="text-xs text-[var(--muted)]">vence dia {contract.dueDay}</div>
                      </div>
                      <Badge label={contract.status} tone={contract.status === "active" ? "success" : "warning"} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                      <Badge label={money(contract.monthlyFeeCents)} />
                      <Badge label={contract.generateInvoice ? "NF ativa" : "NF inativa"} tone={contract.generateInvoice ? "success" : "warning"} />
                      <Badge label={contract.generateBoleto ? "Boleto" : "Sem boleto"} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Sem contratos ativos.</div>
              )}
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Leitura rápida</div>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Serviços ativos" value={`${overview?.metrics.servicesActive ?? 0}`} />
              <InfoRow label="Próxima competência" value={overview?.metrics.nextCompetenceMonth ? monthLabel(overview.metrics.nextCompetenceMonth) : "—"} />
              <InfoRow label="Contratos com cobrança" value={`${reportMetrics.billingConfigured}`} />
            </div>
          </div>
        </section>
      </div>
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
