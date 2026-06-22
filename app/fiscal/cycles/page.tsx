"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export default function FiscalCyclesPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "processing" | "completed" | "failed">("all");
  const [competenceMonth, setCompetenceMonth] = useState(monthStartIso());

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

  async function runCycle(month = competenceMonth) {
    setRunning(true);
    setToast(null);
    try {
      const res = await fetch(`/api/financeiro/cycles/run?competenceMonth=${month}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Falha ao executar ciclo");
      const data = (await res.json().catch(() => null)) as { itemsCreated?: number; cycleId?: string } | null;
      setToast(data?.itemsCreated ? `Ciclo executado com ${data.itemsCreated} itens.` : "Ciclo executado.");
      await load();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao executar ciclo");
    } finally {
      setRunning(false);
    }
  }

  const cycles = useMemo(() => {
    return (overview?.cycles ?? []).filter((cycle) => (statusFilter === "all" ? true : cycle.status === statusFilter));
  }, [overview, statusFilter]);

  const cycleSummary = useMemo(() => {
    const source = overview?.cycles ?? [];
    return {
      completed: source.filter((cycle) => cycle.status === "completed").length,
      processing: source.filter((cycle) => cycle.status === "processing").length,
      pending: source.filter((cycle) => cycle.status === "pending").length,
      totalValue: source.reduce((sum, cycle) => sum + cycle.totalCents, 0),
    };
  }, [overview]);

  const latestCycle = overview?.cycles[0] ?? null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Ciclos</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Execuções mensais</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Acompanhe a movimentação por competência, filtre por status e execute a competência atual.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/fiscal/reports" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Relatórios
          </Link>
          <Link href="/financeiro/operacao" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Operação
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando ciclos...</div> : null}
      {toast ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{toast}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pendentes" value={`${overview?.metrics.cyclesPending ?? 0}`} hint="Aguardando processamento" />
        <Stat label="Processando" value={`${cycleSummary.processing}`} hint="Em execução" />
        <Stat label="Concluídos" value={`${cycleSummary.completed}`} hint="Fechados com sucesso" />
        <Stat label="Valor acumulado" value={centsToCurrency(cycleSummary.totalValue)} hint={overview?.metrics.nextCompetenceMonth ? monthLabel(overview.metrics.nextCompetenceMonth) : "Competência"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Controle</div>
              <div className="mt-1 text-xl font-semibold">Executar competência</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runCycle(monthStartIso())}
                disabled={running}
                className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                {running ? "Executando..." : "Competência atual"}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]"
              >
                Atualizar
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Competência</span>
              <input
                type="date"
                value={competenceMonth}
                onChange={(e) => setCompetenceMonth(e.target.value)}
                className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void runCycle(competenceMonth)}
              disabled={running}
              className="self-end rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              {running ? "Processando..." : "Rodar competência"}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => setStatusFilter("all")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Todos
            </button>
            <button type="button" onClick={() => setStatusFilter("pending")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Pendentes
            </button>
            <button type="button" onClick={() => setStatusFilter("processing")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Processando
            </button>
            <button type="button" onClick={() => setStatusFilter("completed")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Concluídos
            </button>
            <button type="button" onClick={() => setStatusFilter("failed")} className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs font-medium">
              Falhas
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {cycles.length ? (
              cycles.map((cycle) => (
                <div key={cycle.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{monthLabel(cycle.competenceMonth)}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {cycle.status} • {cycle.itemCount} itens
                        {cycle.executedAt ? ` • executado em ${new Date(cycle.executedAt).toLocaleString("pt-BR")}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{centsToCurrency(cycle.totalCents)}</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge label={cycle.status} tone={cycle.status === "completed" ? "success" : cycle.status === "failed" ? "danger" : "warning"} />
                    <Badge label={`${cycle.itemCount} itens`} />
                    <Badge label={monthLabel(cycle.competenceMonth)} />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Nenhum ciclo encontrado para o filtro.</div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Último ciclo</div>
            <div className="mt-1 text-xl font-semibold">{latestCycle ? monthLabel(latestCycle.competenceMonth) : "—"}</div>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Status" value={latestCycle?.status ?? "—"} />
              <InfoRow label="Itens" value={`${latestCycle?.itemCount ?? 0}`} />
              <InfoRow label="Valor" value={centsToCurrency(latestCycle?.totalCents ?? 0)} />
              <InfoRow label="Executado em" value={latestCycle?.executedAt ? new Date(latestCycle.executedAt).toLocaleString("pt-BR") : "—"} />
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Resumo operacional</div>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Competência atual" value={overview?.metrics.nextCompetenceMonth ? monthLabel(overview.metrics.nextCompetenceMonth) : "—"} />
              <InfoRow label="Ciclos pendentes" value={`${overview?.metrics.cyclesPending ?? 0}`} />
              <InfoRow label="Concluídos" value={`${cycleSummary.completed}`} />
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
