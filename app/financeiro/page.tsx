"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Overview = {
  metrics: {
    openReceivables: number;
    overdueReceivables: number;
    paidThisMonthCents: number;
    openAvulsos: number;
    totalOpenCents: number;
    currentCompetenceMonth: string;
  };
  cycles: Array<{
    id: string;
    competenceMonth: string;
    status: string;
    executedAt: string | null;
    itemCount: number;
    totalCents: number;
  }>;
  contracts: Array<{
    id: string;
    clientName: string;
    status: string;
    monthlyFeeCents: number;
    dueDay: number;
  }>;
  entries: Array<{
    id: string;
    clientName: string | null;
    amountCents: number;
    status: string;
    dueDate: string | null;
  }>;
  extraServices: Array<{
    id: string;
    clientName: string;
    amountCents: number;
    competenceMonth: string;
    status: string;
  }>;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

export default function FinanceiroDashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/financeiro/overview", { cache: "no-store" });
        if (res.ok) {
          setOverview((await res.json()) as Overview);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const chartBars = useMemo(() => {
    const cycles = overview?.cycles ?? [];
    const max = Math.max(1, ...cycles.map((cycle) => cycle.totalCents));
    return cycles.slice(0, 6).map((cycle) => ({
      ...cycle,
      height: Math.max(10, Math.round((cycle.totalCents / max) * 100)),
    }));
  }, [overview]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Visão geral</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Painel financeiro</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/financeiro/operacao" className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
            Abrir operação
          </Link>
          <Link href="/financeiro/relatorios" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Relatórios
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando...</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Em aberto" value={`${overview?.metrics.openReceivables ?? 0}`} />
        <Metric label="Atrasados" value={`${overview?.metrics.overdueReceivables ?? 0}`} />
        <Metric label="Recebido no mês" value={formatMoney(overview?.metrics.paidThisMonthCents ?? 0)} />
        <Metric label="Saldo em aberto" value={formatMoney(overview?.metrics.totalOpenCents ?? 0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Previsto x competência</div>
              <div className="mt-1 text-xl font-semibold">Ciclos recentes</div>
            </div>
            <div className="text-xs text-[var(--muted)]">{overview?.metrics.currentCompetenceMonth ?? "—"}</div>
          </div>
          <div className="mt-6 flex h-64 items-end gap-3">
            {chartBars.length ? (
              chartBars.map((cycle) => (
                <div key={cycle.id} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full items-end justify-center">
                    <div
                      className="w-full max-w-[56px] rounded-t-[20px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_82%,white),color-mix(in_srgb,var(--primary)_35%,transparent))]"
                      style={{ height: `${cycle.height}%` }}
                    />
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">{cycle.status}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-[var(--muted)]">Sem ciclos.</div>
            )}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(overview?.cycles ?? []).slice(0, 4).map((cycle) => (
              <div key={cycle.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{cycle.status}</div>
                <div className="mt-1 text-sm font-semibold">{cycle.itemCount} itens</div>
                <div className="text-xs text-[var(--muted)]">{formatMoney(cycle.totalCents)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Fila do mês</div>
          <div className="mt-4 space-y-3">
            {[
              { label: "Contratos ativos", value: overview?.contracts.length ?? 0 },
              { label: "Lançamentos em aberto", value: overview?.entries.filter((entry) => entry.status !== "paid").length ?? 0 },
              { label: "Avulsos pendentes", value: overview?.extraServices.filter((item) => item.status !== "paid").length ?? 0 },
              { label: "Ciclos pendentes", value: overview?.cycles.filter((cycle) => cycle.status !== "done").length ?? 0 },
            ].map((item, index) => {
              const widths = [88, 72, 54, 64];
              return (
                <div key={item.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-sm font-semibold">{item.value}</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_78%,white),color-mix(in_srgb,var(--primary)_55%,transparent))]" style={{ width: `${widths[index] ?? 50}%` }} />
                  </div>
                </div>
              );
            })}
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
