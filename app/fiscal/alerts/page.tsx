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

function AlertCard({ title, description, tone }: { title: string; description: string; tone: "danger" | "warning" | "neutral" }) {
  const classes =
    tone === "danger"
      ? "border-red-500/20 bg-red-500/10"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10"
        : "border-[var(--border)] bg-[var(--surface-1)]";

  return (
    <div className={`rounded-[28px] border p-5 ${classes}`}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{description}</div>
    </div>
  );
}

export default function FiscalAlertsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/fiscal/overview", { cache: "no-store" });
        if (res.ok) setOverview((await res.json()) as Overview);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const alerts = useMemo(() => {
    const contracts = overview?.contracts ?? [];
    const cycles = overview?.cycles ?? [];
    return [
      {
        tone: "danger" as const,
        title: "Cadastro fiscal incompleto",
        description: `${contracts.filter((contract) => !contract.billingEmail || !contract.invoiceServiceCode).length} contratos precisam de ajuste antes da emissão.`,
      },
      {
        tone: "warning" as const,
        title: "Envio de cobrança incompleto",
        description: `${contracts.filter((contract) => contract.generateInvoice && !(contract.sendEmail || contract.sendWhatsapp)).length} contratos estão sem canal de envio.`,
      },
      {
        tone: "warning" as const,
        title: "Ciclos pendentes",
        description: `${cycles.filter((cycle) => cycle.status === "pending" || cycle.status === "processing").length} ciclos aguardam processamento.`,
      },
      {
        tone: "neutral" as const,
        title: "Catálogo fiscal ativo",
        description: `${overview?.metrics.servicesActive ?? 0} serviços estão disponíveis para emissão.`,
      },
    ];
  }, [overview]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Alertas</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Pontos de atenção da operação</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Prioridades automáticas para manter o fluxo fiscal sem retrabalho.</p>
        </div>
        <Link href="/fiscal/invoice" className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
          Abrir emissão
        </Link>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando...</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AlertCard title="Contratos ativos" description={`${overview?.metrics.activeContracts ?? 0} contratos ativos monitorados.`} tone="neutral" />
        <AlertCard title="Notas prontas" description={`${overview?.metrics.invoiceReady ?? 0} notas podem ser emitidas agora.`} tone="neutral" />
        <AlertCard title="Ciclos pendentes" description={`${overview?.metrics.cyclesPending ?? 0} ciclos precisam de ação.`} tone="warning" />
        <AlertCard title="Serviços ativos" description={`${overview?.metrics.servicesActive ?? 0} serviços disponíveis no catálogo.`} tone="neutral" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {alerts.map((alert) => (
          <AlertCard key={alert.title} title={alert.title} description={alert.description} tone={alert.tone} />
        ))}
      </div>
    </section>
  );
}
