"use client";

import { useEffect, useState } from "react";
import { centsToCurrency, monthLabel } from "@/lib/finance";

type Cycle = {
  id: string;
  competenceMonth: string;
  status: string;
  executedAt: string | null;
  itemCount: number;
  totalCents: number;
};

export const dynamic = "force-dynamic";

export default function FiscalCyclesPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/financeiro/overview", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { cycles?: Cycle[] };
          setCycles(data.cycles ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Ciclos</div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Execuções mensais.</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Acompanhe a movimentação por competência e o volume processado em cada ciclo.</p>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando ciclos...</div> : null}

      <div className="space-y-3">
        {cycles.length ? (
          cycles.map((cycle) => (
            <div key={cycle.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{monthLabel(cycle.competenceMonth)}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {cycle.status} · {cycle.itemCount} itens
                    {cycle.executedAt ? ` · executado em ${new Date(cycle.executedAt).toLocaleString("pt-BR")}` : ""}
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
