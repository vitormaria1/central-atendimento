"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { centsToCurrency } from "@/lib/finance";

type ClientItem = { id: string; name: string };
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
    updatedAt: string;
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
    updatedAt: string;
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

const emptyContract = {
  clientId: "",
  status: "draft",
  monthlyFee: "",
  dueDay: "1",
  contractStartDate: "",
  contractEndDate: "",
  billingEmail: "",
  billingWhatsapp: "",
  sendEmail: true,
  sendWhatsapp: true,
  generateInvoice: true,
  generateBoleto: true,
  focusCustomerId: "",
  focusServiceId: "",
  interCustomerId: "",
  interWalletId: "",
  invoiceServiceCode: "",
  invoiceServiceDescription: "",
  invoiceNature: "",
  notes: "",
};

const emptyService = {
  code: "",
  name: "",
  description: "",
  municipalCode: "",
  cnae: "",
  taxRegime: "",
  active: true,
};

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function FiscalShell() {
  const [me, setMe] = useState<{ agentName: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [contractForm, setContractForm] = useState(emptyContract);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [loading, setLoading] = useState(true);
  const [savingContract, setSavingContract] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [overviewRes, clientsRes, meRes] = await Promise.all([
        fetch("/api/fiscal/overview", { cache: "no-store" }),
        fetch("/api/clients?limit=200", { cache: "no-store" }),
        fetch("/api/me", { cache: "no-store" }),
      ]);
      if (overviewRes.ok) setOverview((await overviewRes.json()) as Overview);
      if (clientsRes.ok) {
        const data = (await clientsRes.json()) as { items: ClientItem[] };
        setClients(data.items ?? []);
      }
      if (meRes.ok) setMe((await meRes.json()) as { agentName: string });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function saveContract() {
    if (!contractForm.clientId) {
      setToast("Selecione um cliente.");
      return;
    }
    if (!contractForm.monthlyFee.trim()) {
      setToast("Informe o honorário mensal.");
      return;
    }

    setSavingContract(true);
    setToast(null);
    try {
      const res = await fetch("/api/fiscal/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: Number(contractForm.clientId),
          status: contractForm.status,
          monthlyFeeCents: Math.round(Number.parseFloat(contractForm.monthlyFee.replace(",", ".")) * 100),
          dueDay: Number(contractForm.dueDay || "1"),
          contractStartDate: contractForm.contractStartDate || null,
          contractEndDate: contractForm.contractEndDate || null,
          billingEmail: contractForm.billingEmail || null,
          billingWhatsapp: contractForm.billingWhatsapp || null,
          sendEmail: contractForm.sendEmail,
          sendWhatsapp: contractForm.sendWhatsapp,
          generateInvoice: contractForm.generateInvoice,
          generateBoleto: contractForm.generateBoleto,
          focusCustomerId: contractForm.focusCustomerId || null,
          focusServiceId: contractForm.focusServiceId || null,
          interCustomerId: contractForm.interCustomerId || null,
          interWalletId: contractForm.interWalletId || null,
          invoiceServiceCode: contractForm.invoiceServiceCode || null,
          invoiceServiceDescription: contractForm.invoiceServiceDescription || null,
          invoiceNature: contractForm.invoiceNature || null,
          notes: contractForm.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar contrato");
      setToast("Contrato salvo.");
      setContractForm(emptyContract);
      await loadData();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao salvar contrato");
    } finally {
      setSavingContract(false);
    }
  }

  async function saveService() {
    if (!serviceForm.code.trim() || !serviceForm.name.trim()) {
      setToast("Informe código e nome do serviço.");
      return;
    }
    setSavingService(true);
    setToast(null);
    try {
      const res = await fetch("/api/fiscal/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: serviceForm.code,
          name: serviceForm.name,
          description: serviceForm.description || null,
          municipalCode: serviceForm.municipalCode || null,
          cnae: serviceForm.cnae || null,
          taxRegime: serviceForm.taxRegime || null,
          active: serviceForm.active,
          focusPayload: {},
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar serviço");
      setToast("Serviço salvo.");
      setServiceForm(emptyService);
      await loadData();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao salvar serviço");
    } finally {
      setSavingService(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Fiscal</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gestão fiscal e contratos</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
              Estruture contratos, serviço fiscal, parâmetros de emissão e o ciclo automático de notas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm hover:bg-[var(--surface-2)]">
              Voltar
            </Link>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm text-[var(--muted)]">
              {me ? me.agentName : "Carregando..."}
            </div>
          </div>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
            Carregando painel fiscal...
          </div>
        ) : null}

        {toast ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{toast}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Contratos ativos" value={`${overview?.metrics.activeContracts ?? 0}`} />
          <Metric label="Prontos para nota" value={`${overview?.metrics.invoiceReady ?? 0}`} />
          <Metric label="Ciclos pendentes" value={`${overview?.metrics.cyclesPending ?? 0}`} />
          <Metric label="Serviços ativos" value={`${overview?.metrics.servicesActive ?? 0}`} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
          <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Contratos</div>
                <div className="mt-1 text-xl font-semibold">Contrato por cliente</div>
              </div>
              <div className="text-sm text-[var(--muted)]">Próximo ciclo: {overview?.metrics.nextCompetenceMonth ?? "—"}</div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select
                value={contractForm.clientId}
                onChange={(e) => setContractForm((prev) => ({ ...prev, clientId: e.target.value }))}
                className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm"
              >
                <option value="">Selecionar cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <select
                value={contractForm.status}
                onChange={(e) => setContractForm((prev) => ({ ...prev, status: e.target.value }))}
                className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm"
              >
                <option value="draft">Rascunho</option>
                <option value="active">Ativo</option>
                <option value="paused">Pausado</option>
                <option value="closed">Encerrado</option>
              </select>
              <Field label="Honorário mensal" value={contractForm.monthlyFee} onChange={(v) => setContractForm((prev) => ({ ...prev, monthlyFee: v }))} placeholder="Ex.: 2500,00" />
              <Field label="Dia do vencimento" value={contractForm.dueDay} onChange={(v) => setContractForm((prev) => ({ ...prev, dueDay: v }))} placeholder="1" />
              <Field label="E-mail de cobrança" value={contractForm.billingEmail} onChange={(v) => setContractForm((prev) => ({ ...prev, billingEmail: v }))} />
              <Field label="WhatsApp de cobrança" value={contractForm.billingWhatsapp} onChange={(v) => setContractForm((prev) => ({ ...prev, billingWhatsapp: v }))} />
              <Field label="Início do contrato" value={contractForm.contractStartDate} onChange={(v) => setContractForm((prev) => ({ ...prev, contractStartDate: v }))} />
              <Field label="Fim do contrato" value={contractForm.contractEndDate} onChange={(v) => setContractForm((prev) => ({ ...prev, contractEndDate: v }))} />
              <Field label="Serviço Focus" value={contractForm.focusServiceId} onChange={(v) => setContractForm((prev) => ({ ...prev, focusServiceId: v }))} />
              <Field label="Serviço Inter" value={contractForm.interWalletId} onChange={(v) => setContractForm((prev) => ({ ...prev, interWalletId: v }))} />
              <Field label="Código do serviço" value={contractForm.invoiceServiceCode} onChange={(v) => setContractForm((prev) => ({ ...prev, invoiceServiceCode: v }))} />
              <Field label="Descrição do serviço" value={contractForm.invoiceServiceDescription} onChange={(v) => setContractForm((prev) => ({ ...prev, invoiceServiceDescription: v }))} />
              <textarea
                value={contractForm.notes}
                onChange={(e) => setContractForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Observações do contrato"
                className="min-h-[92px] rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm md:col-span-2"
              />
              <div className="flex flex-wrap gap-3 md:col-span-2">
                <Toggle label="Gerar nota" checked={contractForm.generateInvoice} onChange={(checked) => setContractForm((prev) => ({ ...prev, generateInvoice: checked }))} />
                <Toggle label="Gerar boleto" checked={contractForm.generateBoleto} onChange={(checked) => setContractForm((prev) => ({ ...prev, generateBoleto: checked }))} />
                <Toggle label="Enviar e-mail" checked={contractForm.sendEmail} onChange={(checked) => setContractForm((prev) => ({ ...prev, sendEmail: checked }))} />
                <Toggle label="Enviar WhatsApp" checked={contractForm.sendWhatsapp} onChange={(checked) => setContractForm((prev) => ({ ...prev, sendWhatsapp: checked }))} />
              </div>
              <button
                type="button"
                onClick={() => void saveContract()}
                disabled={savingContract}
                className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60 md:col-span-2"
              >
                {savingContract ? "Salvando..." : "Salvar contrato"}
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-[26px] border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-semibold">Contratos cadastrados</div>
              <div className="max-h-[440px] overflow-auto">
                {(overview?.contracts ?? []).map((contract) => (
                  <div key={contract.id} className="grid gap-2 border-b border-[var(--border)] px-4 py-4 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
                    <div>
                      <div className="font-semibold">{contract.clientName}</div>
                      <div className="text-xs text-[var(--muted)]">{contract.status} · vence dia {contract.dueDay}</div>
                    </div>
                    <div className="text-sm">{centsToCurrency(contract.monthlyFeeCents)}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {contract.generateInvoice ? "NF" : "Sem NF"} · {contract.generateBoleto ? "boleto" : "sem boleto"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Serviços fiscais</div>
              <div className="mt-1 text-xl font-semibold">Catálogo de serviços</div>
              <div className="mt-4 grid gap-3">
                <Field label="Código" value={serviceForm.code} onChange={(v) => setServiceForm((prev) => ({ ...prev, code: v }))} />
                <Field label="Nome" value={serviceForm.name} onChange={(v) => setServiceForm((prev) => ({ ...prev, name: v }))} />
                <Field label="Código municipal" value={serviceForm.municipalCode} onChange={(v) => setServiceForm((prev) => ({ ...prev, municipalCode: v }))} />
                <Field label="CNAE" value={serviceForm.cnae} onChange={(v) => setServiceForm((prev) => ({ ...prev, cnae: v }))} />
                <Field label="Regime tributário" value={serviceForm.taxRegime} onChange={(v) => setServiceForm((prev) => ({ ...prev, taxRegime: v }))} />
                <textarea
                  value={serviceForm.description}
                  onChange={(e) => setServiceForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição do serviço"
                  className="min-h-[92px] rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void saveService()}
                  disabled={savingService}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
                >
                  {savingService ? "Salvando..." : "Salvar serviço"}
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {(overview?.services ?? []).map((service) => (
                  <div key={service.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{service.name}</div>
                        <div className="text-xs text-[var(--muted)]">{service.code} · {service.active ? "ativo" : "inativo"}</div>
                      </div>
                      <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)]">
                        {service.taxRegime || "sem regime"}
                      </span>
                    </div>
                    {service.description ? <div className="mt-2 text-sm text-[var(--muted)]">{service.description}</div> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Ciclos</div>
              <div className="mt-1 text-xl font-semibold">Execuções mensais</div>
              <div className="mt-4 space-y-3">
                {(overview?.cycles ?? []).map((cycle) => (
                  <div key={cycle.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{formatDate(`${cycle.competenceMonth}T00:00:00`)}</div>
                        <div className="text-xs text-[var(--muted)]">{cycle.status} · {cycle.itemCount} itens</div>
                      </div>
                      <div className="text-sm font-semibold">{centsToCurrency(cycle.totalCents)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
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

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm outline-none"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        "rounded-full border px-3 py-2 text-xs transition",
        checked
          ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--foreground)]"
          : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--muted)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
