"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { centsToCurrency, monthLabel } from "@/lib/finance";

type Overview = {
  metrics: {
    openReceivables: number;
    overdueReceivables: number;
    paidThisMonthCents: number;
    openAvulsos: number;
    totalOpenCents: number;
    currentCompetenceMonth: string;
  };
  contracts: Array<{
    id: string;
    clientName: string;
    status: string;
    monthlyFeeCents: number;
    dueDay: number;
    billingEmail: string | null;
    billingWhatsapp: string | null;
    generateInvoice: boolean;
    generateBoleto: boolean;
    sendEmail: boolean;
    sendWhatsapp: boolean;
    updatedAt: string;
  }>;
  entries: Array<{
    id: string;
    clientName: string | null;
    sourceLabel: string;
    amountCents: number;
    status: string;
    dueDate: string | null;
    kind: string;
    sourceType: string;
    competenceMonth: string | null;
    paidAt: string | null;
  }>;
  extraServices: Array<{
    id: string;
    clientName: string;
    description: string;
    amountCents: number;
    status: string;
    competenceMonth: string;
    serviceDate: string;
  }>;
  cycles: Array<{
    id: string;
    competenceMonth: string;
    status: string;
    executedAt: string | null;
    itemCount: number;
    totalCents: number;
  }>;
};

export default function FinanceiroRelatoriosPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/financeiro/overview", { cache: "no-store" });
        if (res.ok) setOverview((await res.json()) as Overview);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const metrics = useMemo(() => {
    const contracts = overview?.contracts ?? [];
    const entries = overview?.entries ?? [];
    const extraServices = overview?.extraServices ?? [];
    const cycles = overview?.cycles ?? [];

    const activeContracts = contracts.filter((item) => item.status === "active").length;
    const pausedContracts = contracts.filter((item) => item.status === "paused").length;
    const contractsValue = contracts.reduce((sum, item) => sum + item.monthlyFeeCents, 0);
    const overdueValue = entries.filter((item) => item.status === "overdue").reduce((sum, item) => sum + item.amountCents, 0);
    const openValue = entries.filter((item) => item.status === "open").reduce((sum, item) => sum + item.amountCents, 0);
    const realizedValue = entries.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amountCents, 0);
    const avulsosOpen = extraServices.filter((item) => item.status === "open").reduce((sum, item) => sum + item.amountCents, 0);
    const expectedValue = openValue + overdueValue;

    return {
      activeContracts,
      pausedContracts,
      contractsValue,
      overdueValue,
      openValue,
      realizedValue,
      avulsosOpen,
      expectedValue,
      cycles,
    };
  }, [overview]);

  const overdueEntries = useMemo(() => {
    return (overview?.entries ?? [])
      .filter((item) => item.status === "overdue")
      .slice(0, 6);
  }, [overview]);

  const avulsos = useMemo(() => {
    return (overview?.extraServices ?? []).slice(0, 5);
  }, [overview]);

  const cycles = metrics.cycles.slice(0, 6);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Relatórios</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Gestão financeira</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/financeiro/operacao" className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
            Abrir operação
          </Link>
          <Link href="/financeiro/banco" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Banco
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando...</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Previsto" value={centsToCurrency(metrics.expectedValue)} />
        <Metric label="Realizado" value={centsToCurrency(metrics.realizedValue)} />
        <Metric label="Atrasado" value={centsToCurrency(metrics.overdueValue)} />
        <Metric label="Avulsos abertos" value={centsToCurrency(metrics.avulsosOpen)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Previsto x realizado</div>
          <div className="mt-1 text-xl font-semibold">Competência atual</div>

          <div className="mt-5 space-y-4">
            <ProgressRow label="Previsto" value={metrics.expectedValue} total={Math.max(metrics.expectedValue, metrics.realizedValue, 1)} tone="blue" />
            <ProgressRow label="Realizado" value={metrics.realizedValue} total={Math.max(metrics.expectedValue, metrics.realizedValue, 1)} tone="green" />
            <ProgressRow label="Em atraso" value={metrics.overdueValue} total={Math.max(metrics.expectedValue, metrics.overdueValue, 1)} tone="amber" />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <StatCard label="Contratos ativos" value={`${metrics.activeContracts}`} />
            <StatCard label="Contratos pausados" value={`${metrics.pausedContracts}`} />
            <StatCard label="Faturamento mensal" value={centsToCurrency(metrics.contractsValue)} />
          </div>
        </section>

        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Contratos</div>
          <div className="mt-1 text-xl font-semibold">Base operacional</div>

          <div className="mt-4 space-y-3">
            {(overview?.contracts ?? []).slice(0, 6).map((contract) => (
              <div key={contract.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{contract.clientName}</div>
                    <div className="text-xs text-[var(--muted)]">
                      vence dia {contract.dueDay} • {contract.status}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{centsToCurrency(contract.monthlyFeeCents)}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                  <Tag label={contract.generateInvoice ? "NF" : "Sem NF"} />
                  <Tag label={contract.generateBoleto ? "Boleto" : "Sem boleto"} />
                  <Tag label={contract.sendEmail ? "Email" : "Sem email"} />
                  <Tag label={contract.sendWhatsapp ? "WhatsApp" : "Sem WhatsApp"} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Caixa por competência</div>
          <div className="mt-1 text-xl font-semibold">Últimos ciclos</div>
          <div className="mt-4 space-y-3">
            {cycles.length ? (
              cycles.map((cycle) => (
                <div key={cycle.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{monthLabel(cycle.competenceMonth)}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {cycle.itemCount} itens • {cycle.status}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{centsToCurrency(cycle.totalCents)}</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{ width: `${Math.min(100, Math.max(18, (cycle.totalCents / Math.max(metrics.contractsValue || 1, cycle.totalCents || 1)) * 100))}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
                Sem ciclos registrados.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Inadimplência</div>
            <div className="mt-1 text-xl font-semibold">Pendências prioritárias</div>
            <div className="mt-4 space-y-3">
              {overdueEntries.length ? (
                overdueEntries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{entry.clientName ?? "Sem cliente"}</div>
                        <div className="text-xs text-[var(--muted)]">{entry.sourceLabel}</div>
                      </div>
                      <div className="text-sm font-semibold">{centsToCurrency(entry.amountCents)}</div>
                    </div>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      {entry.dueDate ? `Venceu em ${entry.dueDate}` : "Sem vencimento"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
                  Sem pendências em atraso.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Avulsos</div>
            <div className="mt-1 text-xl font-semibold">Serviços extras</div>
            <div className="mt-4 space-y-3">
              {avulsos.length ? (
                avulsos.map((service) => (
                  <div key={service.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{service.clientName}</div>
                        <div className="text-xs text-[var(--muted)]">{service.description}</div>
                      </div>
                      <div className="text-sm font-semibold">{centsToCurrency(service.amountCents)}</div>
                    </div>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      {service.serviceDate} • {service.status}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
                  Sem serviços avulsos.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "blue" | "green" | "amber";
}) {
  const percent = Math.min(100, Math.max(0, Math.round((value / total) * 100)));
  const color =
    tone === "green" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-sky-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-[var(--muted)]">
          {centsToCurrency(value)} · {percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return <span className="rounded-full border border-[var(--border)] px-2.5 py-1">{label}</span>;
}
