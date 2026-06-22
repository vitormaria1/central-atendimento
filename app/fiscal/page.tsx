"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{hint}</div>
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

  const readiness = useMemo(() => {
    const contracts = overview?.contracts ?? [];
    return {
      activeContracts: contracts.filter((contract) => contract.status === "active").length,
      invoiceEnabled: contracts.filter((contract) => contract.status === "active" && contract.generateInvoice).length,
      boletoEnabled: contracts.filter((contract) => contract.status === "active" && contract.generateBoleto).length,
      readyToSend: contracts.filter((contract) => contract.status === "active" && contract.generateInvoice && (contract.sendEmail || contract.sendWhatsapp)).length,
      missingBillingData: contracts.filter((contract) => !contract.billingEmail || !contract.billingWhatsapp).length,
    };
  }, [overview]);

  const priorityContracts = useMemo(() => {
    return (overview?.contracts ?? [])
      .filter((contract) => contract.status === "active")
      .slice(0, 4);
  }, [overview]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Central de Inteligência</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Fiscal</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">Cockpit fiscal para validar cadastro, acompanhar emissão e controlar a fila mensal de notas.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/fiscal/invoice" className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
            Emitir NFS
          </Link>
          <Link href="/fiscal/services" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Serviços
          </Link>
          <Link href="/fiscal/cycles" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Ciclos
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando...</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Contratos ativos" value={`${overview?.metrics.activeContracts ?? 0}`} hint={`${readiness.activeContracts} com emissão habilitada`} />
        <Stat label="Notas prontas" value={`${overview?.metrics.invoiceReady ?? 0}`} hint={`${readiness.readyToSend} com envio configurado`} />
        <Stat label="Pendências" value={`${overview?.metrics.cyclesPending ?? 0}`} hint={`${readiness.missingBillingData} contratos com dados faltando`} />
        <Stat label="Serviços ativos" value={`${overview?.metrics.servicesActive ?? 0}`} hint={overview?.metrics.nextCompetenceMonth ? monthLabel(overview.metrics.nextCompetenceMonth) : "Próxima competência"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Ciclos</div>
              <div className="mt-1 text-xl font-semibold">Competência e volume</div>
            </div>
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
              <div className="text-sm text-[var(--muted)]">Sem ciclos registrados.</div>
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(overview?.cycles ?? []).slice(0, 4).map((cycle) => (
              <div key={cycle.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">{cycle.status}</div>
                <div className="mt-1 text-sm font-semibold">{cycle.itemCount} itens</div>
                <div className="text-xs text-[var(--muted)]">{money(cycle.totalCents)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Checklist</div>
            <div className="mt-1 text-xl font-semibold">Pronto para operar</div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Contrato ativo", value: readiness.activeContracts },
                { label: "Emissão habilitada", value: readiness.invoiceEnabled },
                { label: "Boleto habilitado", value: readiness.boletoEnabled },
                { label: "Envio configurado", value: readiness.readyToSend },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-sm font-semibold">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Base prioritária</div>
            <div className="mt-1 text-xl font-semibold">Contratos ativos</div>
            <div className="mt-4 space-y-3">
              {priorityContracts.length ? (
                priorityContracts.map((contract) => (
                  <div key={contract.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{contract.clientName}</div>
                        <div className="text-xs text-[var(--muted)]">vence dia {contract.dueDay}</div>
                      </div>
                      <Badge tone={contract.generateInvoice ? "success" : "warning"}>{contract.generateInvoice ? "NF ativa" : "NF inativa"}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                      <Badge tone="neutral">{money(contract.monthlyFeeCents)}</Badge>
                      <Badge tone={contract.sendEmail ? "success" : "neutral"}>Email</Badge>
                      <Badge tone={contract.sendWhatsapp ? "success" : "neutral"}>WhatsApp</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
                  Nenhum contrato ativo encontrado.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        <Link href="/fiscal/invoice" className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition hover:bg-[var(--surface-1)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Emissão</div>
          <div className="mt-2 text-xl font-semibold">Gerar nota</div>
          <div className="mt-2 text-sm text-[var(--muted)]">Abrir a fila de emissão e validar o tomador antes de emitir.</div>
        </Link>
        <Link href="/fiscal/services" className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition hover:bg-[var(--surface-1)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Catálogo</div>
          <div className="mt-2 text-xl font-semibold">Serviços</div>
          <div className="mt-2 text-sm text-[var(--muted)]">Manter códigos, CNAE e parâmetros fiscais do escritório.</div>
        </Link>
        <Link href="/fiscal/alerts" className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition hover:bg-[var(--surface-1)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Alertas</div>
          <div className="mt-2 text-xl font-semibold">Pendências</div>
          <div className="mt-2 text-sm text-[var(--muted)]">Acompanhar cadastro incompleto, notas com falha e ciclos em atraso.</div>
        </Link>
      </section>
    </section>
  );
}
