"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Overview = {
  metrics: {
    activeContracts: number;
    invoiceReady: number;
    cyclesPending: number;
    servicesActive: number;
    nextCompetenceMonth: string;
  };
  cycles: Array<{
    id: string;
    competenceMonth: string;
    status: string;
    itemCount: number;
    totalCents: number;
  }>;
};

const metricLabels = [
  { key: "activeContracts" as const, label: "Contratos", tone: "from-[color-mix(in_srgb,var(--primary)_35%,transparent)] to-[color-mix(in_srgb,var(--primary)_12%,transparent)]" },
  { key: "invoiceReady" as const, label: "Notas", tone: "from-[color-mix(in_srgb,var(--accent)_35%,transparent)] to-[color-mix(in_srgb,var(--accent)_12%,transparent)]" },
  { key: "cyclesPending" as const, label: "Pendências", tone: "from-[color-mix(in_srgb,var(--warning)_35%,transparent)] to-[color-mix(in_srgb,var(--warning)_12%,transparent)]" },
  { key: "servicesActive" as const, label: "Serviços", tone: "from-[color-mix(in_srgb,var(--foreground)_18%,transparent)] to-[color-mix(in_srgb,var(--foreground)_6%,transparent)]" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

export default function FiscalHomePage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/fiscal/overview", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as Overview;
          setOverview(data);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const cycleBars = useMemo(() => {
    const cycles = overview?.cycles ?? [];
    const max = Math.max(1, ...cycles.map((cycle) => cycle.totalCents));
    return cycles.slice(0, 6).map((cycle) => ({
      ...cycle,
      height: Math.max(8, Math.round((cycle.totalCents / max) * 100)),
    }));
  }, [overview]);

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Central de Inteligência</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Visão geral</h2>
        </div>
        <Link href="/fiscal/invoice" className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
          Emitir NFS
        </Link>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando...</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricLabels.map((metric) => {
          const value = overview?.metrics[metric.key] ?? 0;
          return (
            <div key={metric.key} className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{metric.label}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div className={`h-full rounded-full bg-gradient-to-r ${metric.tone}`} style={{ width: `${Math.min(100, Math.max(12, value * 10))}%` }} />
              </div>
              <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Ciclos</div>
            <div className="text-xs text-[var(--muted)]">{overview?.metrics.nextCompetenceMonth ?? "—"}</div>
          </div>
          <div className="mt-6 flex h-60 items-end gap-3">
            {cycleBars.length ? (
              cycleBars.map((cycle) => (
                <div key={cycle.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex w-full items-end justify-center">
                    <div
                      className="w-full max-w-[56px] rounded-t-[20px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--primary)_82%,white),color-mix(in_srgb,var(--primary)_35%,transparent))] shadow-[0_16px_30px_rgba(35,66,244,0.18)]"
                      style={{ height: `${cycle.height}%` }}
                    />
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">{cycle.status}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-[var(--muted)]">—</div>
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Status</div>
          <div className="mt-5 space-y-3">
            {[
              { label: "Contratos ativos", value: overview?.metrics.activeContracts ?? 0 },
              { label: "Notas prontas", value: overview?.metrics.invoiceReady ?? 0 },
              { label: "Ciclos pendentes", value: overview?.metrics.cyclesPending ?? 0 },
              { label: "Serviços ativos", value: overview?.metrics.servicesActive ?? 0 },
            ].map((item, index) => {
              const widths = [88, 74, 56, 62];
              return (
                <div key={item.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-sm font-semibold">{item.value}</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_78%,white),color-mix(in_srgb,var(--primary)_55%,transparent))]"
                      style={{ width: `${widths[index] ?? 50}%` }}
                    />
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
