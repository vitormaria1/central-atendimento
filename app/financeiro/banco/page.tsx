"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { centsToCurrency } from "@/lib/finance";

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

type BankStatusFilter = "all" | "open" | "overdue" | "paid";

export default function FinanceiroBancoPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<BankStatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "receivable" | "payable">("all");

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

  const entries = useMemo(() => {
    const source = overview?.entries ?? [];
    return source.filter((entry) => {
      const matchesStatus = statusFilter === "all" ? true : entry.status === statusFilter;
      const matchesKind = kindFilter === "all" ? true : entry.kind === kindFilter;
      return matchesStatus && matchesKind;
    });
  }, [overview, kindFilter, statusFilter]);

  const summary = useMemo(() => {
    const source = overview?.entries ?? [];
    return {
      open: source.filter((item) => item.status === "open").length,
      overdue: source.filter((item) => item.status === "overdue").length,
      paid: source.filter((item) => item.status === "paid").length,
      totalOpen: source.filter((item) => item.status === "open" || item.status === "overdue").reduce((sum, item) => sum + item.amountCents, 0),
    };
  }, [overview]);

  const reconciliationRows = useMemo(() => {
    return (overview?.entries ?? []).slice(0, 8).map((entry) => ({
      id: entry.id,
      label: entry.clientName ?? "Sem cliente",
      amount: entry.amountCents,
      status: entry.status,
      dueDate: entry.dueDate,
      matched: entry.status === "paid" ? "Liquidado" : "Aguardando conciliação",
    }));
  }, [overview]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Banco</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Conciliação e saldo</h2>
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
        <Metric label="Entradas abertas" value={`${summary.open}`} />
        <Metric label="Atrasadas" value={`${summary.overdue}`} />
        <Metric label="Liquidadas" value={`${summary.paid}`} />
        <Metric label="Saldo previsto" value={centsToCurrency(summary.totalOpen)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Conciliação</div>
          <div className="mt-1 text-xl font-semibold">Fila operacional</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label="Todos" />
            <FilterButton active={statusFilter === "open"} onClick={() => setStatusFilter("open")} label="Abertos" />
            <FilterButton active={statusFilter === "overdue"} onClick={() => setStatusFilter("overdue")} label="Atrasados" />
            <FilterButton active={statusFilter === "paid"} onClick={() => setStatusFilter("paid")} label="Pagos" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FilterButton active={kindFilter === "all"} onClick={() => setKindFilter("all")} label="Todos os tipos" />
            <FilterButton active={kindFilter === "receivable"} onClick={() => setKindFilter("receivable")} label="Recebíveis" />
            <FilterButton active={kindFilter === "payable"} onClick={() => setKindFilter("payable")} label="Pagáveis" />
          </div>

          <div className="mt-4 space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{entry.clientName ?? "Sem cliente"}</div>
                    <div className="text-xs text-[var(--muted)]">{entry.sourceLabel}</div>
                  </div>
                  <div className="text-sm font-semibold">{centsToCurrency(entry.amountCents)}</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <span>{entry.status}</span>
                  {entry.dueDate ? <span>• vence {entry.dueDate}</span> : null}
                  <span>• {entry.kind}</span>
                </div>
              </div>
            ))}
            {!entries.length ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Sem lançamentos para o filtro.</div> : null}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Extrato interno</div>
            <div className="mt-1 text-xl font-semibold">Movimentação recente</div>
            <div className="mt-4 space-y-3">
              {reconciliationRows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.label}</div>
                      <div className="text-xs text-[var(--muted)]">{row.matched}</div>
                    </div>
                    <div className="text-sm font-semibold">{centsToCurrency(row.amount)}</div>
                  </div>
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    {row.status}
                    {row.dueDate ? ` • ${row.dueDate}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Conta corrente</div>
            <div className="mt-1 text-xl font-semibold">Pronto para conciliar</div>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Saldo previsto" value={centsToCurrency(overview?.metrics.totalOpenCents ?? 0)} />
              <InfoRow label="Recebido no mês" value={centsToCurrency(overview?.metrics.paidThisMonthCents ?? 0)} />
              <InfoRow label="Avulsos abertos" value={`${overview?.metrics.openAvulsos ?? 0}`} />
              <InfoRow label="Competência" value={overview?.metrics.currentCompetenceMonth ?? "—"} />
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

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-2 text-xs font-medium transition",
        active
          ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--foreground)]"
          : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted)] hover:bg-[var(--surface-2)]",
      ].join(" ")}
    >
      {label}
    </button>
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
