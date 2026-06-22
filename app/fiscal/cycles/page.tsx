"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { centsToCurrency, monthLabel, monthStartIso } from "@/lib/finance";

type Cycle = {
  id: string;
  competenceMonth: string;
  status: string;
  executedAt: string | null;
  itemCount: number;
  totalCents: number;
};

type Overview = {
  metrics: {
    cyclesPending: number;
    nextCompetenceMonth: string;
  };
  cycles: Cycle[];
};

export default function FiscalCyclesPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/fiscal/overview", { cache: "no-store" });
      if (res.ok) {
        setOverview((await res.json()) as Overview);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runCycle() {
    setRunning(true);
    setToast(null);
    try {
      const res = await fetch(`/api/financeiro/cycles/run?competenceMonth=${monthStartIso()}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Falha ao executar ciclo");
      setToast("Ciclo executado.");
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao executar ciclo");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Ciclos</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Execuções mensais</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Acompanhe a movimentação por competência e execute o ciclo atual quando necessário.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runCycle()}
            disabled={running}
            className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {running ? "Executando..." : "Executar competência"}
          </button>
          <Link href="/financeiro/operacao" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Operação
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando ciclos...</div> : null}
      {toast ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{toast}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pendentes" value={`${overview?.metrics.cyclesPending ?? 0}`} />
        <Stat label="Competência" value={overview?.metrics.nextCompetenceMonth ? monthLabel(overview.metrics.nextCompetenceMonth) : "—"} />
        <Stat label="Último ciclo" value={overview?.cycles[0]?.status ?? "—"} />
        <Stat label="Itens do último" value={`${overview?.cycles[0]?.itemCount ?? 0}`} />
      </div>

      <div className="space-y-3">
        {(overview?.cycles ?? []).length ? (
          (overview?.cycles ?? []).map((cycle) => (
            <div key={cycle.id} className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{monthLabel(cycle.competenceMonth)}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {cycle.status} • {cycle.itemCount} itens
                    {cycle.executedAt ? ` • executado em ${new Date(cycle.executedAt).toLocaleString("pt-BR")}` : ""}
                  </div>
                </div>
                <div className="text-sm font-semibold">{centsToCurrency(cycle.totalCents)}</div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
            Nenhum ciclo encontrado.
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
