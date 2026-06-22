"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { centsToCurrency, monthStartIso } from "@/lib/finance";

type ClientItem = {
  id: string;
  name: string;
  legalName: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  contactName: string | null;
  contactRole: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  municipalRegistration: string | null;
  stateRegistration: string | null;
  taxRegime: string | null;
  fiscalCity: string | null;
  fiscalState: string | null;
  invoiceEmail: string | null;
  serviceCode: string | null;
  serviceDescription: string | null;
  notes: string | null;
};

type ContractItem = {
  id: string;
  clientId: string;
  clientName: string;
  status: "draft" | "active" | "paused" | "closed";
  monthlyFeeCents: number;
  dueDay: number;
  contractStartDate: string | null;
  contractEndDate: string | null;
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
};

type Overview = {
  metrics: {
    activeContracts: number;
    invoiceReady: number;
    cyclesPending: number;
    servicesActive: number;
    nextCompetenceMonth: string;
  };
  contracts: ContractItem[];
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

type ContractForm = {
  clientId: string;
  status: ContractItem["status"];
  monthlyFee: string;
  dueDay: string;
  contractStartDate: string;
  contractEndDate: string;
  billingEmail: string;
  billingWhatsapp: string;
  sendEmail: boolean;
  sendWhatsapp: boolean;
  generateInvoice: boolean;
  generateBoleto: boolean;
  invoiceServiceCode: string;
  invoiceServiceDescription: string;
  notes: string;
};

const emptyForm: ContractForm = {
  clientId: "",
  status: "draft",
  monthlyFee: "",
  dueDay: "1",
  contractStartDate: monthStartIso(),
  contractEndDate: "",
  billingEmail: "",
  billingWhatsapp: "",
  sendEmail: true,
  sendWhatsapp: true,
  generateInvoice: true,
  generateBoleto: true,
  invoiceServiceCode: "",
  invoiceServiceDescription: "",
  notes: "",
};

function moneyInputToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "number";
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm outline-none"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    </label>
  );
}

export default function FinanceiroContratosPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | ContractItem["status"]>("all");
  const [query, setQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [form, setForm] = useState<ContractForm>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [contractsRes, clientsRes] = await Promise.all([
          fetch("/api/fiscal/contracts?limit=100", { cache: "no-store" }),
          fetch("/api/clients?limit=200", { cache: "no-store" }),
        ]);

        if (contractsRes.ok) {
          setOverview((await contractsRes.json()) as Overview);
        }
        if (clientsRes.ok) {
          const data = (await clientsRes.json()) as { items: ClientItem[] };
          setClients(data.items ?? []);
        }
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    const existing = overview?.contracts.find((item) => item.clientId === selectedClientId);
    const client = clients.find((item) => item.id === selectedClientId);
    setForm({
      clientId: selectedClientId,
      status: existing?.status ?? "draft",
      monthlyFee: existing ? (existing.monthlyFeeCents / 100).toFixed(2).replace(".", ",") : "",
      dueDay: String(existing?.dueDay ?? 1),
      contractStartDate: existing?.contractStartDate ?? monthStartIso(),
      contractEndDate: existing?.contractEndDate ?? "",
      billingEmail: existing?.billingEmail ?? client?.invoiceEmail ?? client?.email ?? "",
      billingWhatsapp: existing?.billingWhatsapp ?? client?.whatsapp ?? client?.phone ?? "",
      sendEmail: existing?.sendEmail ?? true,
      sendWhatsapp: existing?.sendWhatsapp ?? true,
      generateInvoice: existing?.generateInvoice ?? true,
      generateBoleto: existing?.generateBoleto ?? true,
      invoiceServiceCode: existing?.invoiceServiceCode ?? client?.serviceCode ?? "",
      invoiceServiceDescription: existing?.invoiceServiceDescription ?? client?.serviceDescription ?? "",
      notes: existing?.notes ?? client?.notes ?? "",
    });
  }, [clients, overview?.contracts, selectedClientId]);

  const filteredContracts = useMemo(() => {
    const source = overview?.contracts ?? [];
    return source.filter((item) => {
      const matchesStatus = statusFilter === "all" ? true : item.status === statusFilter;
      const haystack = `${item.clientName} ${item.billingEmail ?? ""} ${item.billingWhatsapp ?? ""}`.toLowerCase();
      const matchesQuery = query.trim() ? haystack.includes(query.trim().toLowerCase()) : true;
      return matchesStatus && matchesQuery;
    });
  }, [overview, query, statusFilter]);

  const selectedClient = useMemo(
    () => clients.find((item) => item.id === form.clientId) ?? null,
    [clients, form.clientId],
  );

  const contractStats = useMemo(() => {
    const source = overview?.contracts ?? [];
    return {
      active: source.filter((item) => item.status === "active").length,
      paused: source.filter((item) => item.status === "paused").length,
      draft: source.filter((item) => item.status === "draft").length,
      closed: source.filter((item) => item.status === "closed").length,
      invoiceReady: source.filter((item) => item.status === "active" && item.generateInvoice).length,
      boletoReady: source.filter((item) => item.status === "active" && item.generateBoleto).length,
    };
  }, [overview]);

  async function saveContract() {
    if (!form.clientId) {
      setMessage("Selecione um cliente.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/fiscal/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: Number(form.clientId),
          status: form.status,
          monthlyFeeCents: moneyInputToCents(form.monthlyFee),
          dueDay: Number.parseInt(form.dueDay || "1", 10),
          contractStartDate: form.contractStartDate || null,
          contractEndDate: form.contractEndDate || null,
          billingEmail: form.billingEmail || null,
          billingWhatsapp: form.billingWhatsapp || null,
          sendEmail: form.sendEmail,
          sendWhatsapp: form.sendWhatsapp,
          generateInvoice: form.generateInvoice,
          generateBoleto: form.generateBoleto,
          focusCustomerId: null,
          focusServiceId: null,
          interCustomerId: null,
          interWalletId: null,
          invoiceServiceCode: form.invoiceServiceCode || null,
          invoiceServiceDescription: form.invoiceServiceDescription || null,
          invoiceNature: null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar contrato");

      const refreshed = await fetch("/api/fiscal/contracts?limit=100", { cache: "no-store" });
      if (refreshed.ok) setOverview((await refreshed.json()) as Overview);

      setMessage("Contrato salvo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar contrato");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Contratos</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Base de cobrança por cliente</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/financeiro/operacao" className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
            Operação
          </Link>
          <Link href="/fiscal/clients" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
            Clientes
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando...</div> : null}
      {message ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{message}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Ativos" value={`${contractStats.active}`} />
        <Metric label="Rascunhos" value={`${contractStats.draft}`} />
        <Metric label="Prontos para NF" value={`${contractStats.invoiceReady}`} />
        <Metric label="Prontos para boleto" value={`${contractStats.boletoReady}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center gap-3">
            <Field label="Buscar" value={query} onChange={setQuery} placeholder="Cliente, email ou WhatsApp" />
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm"
              >
                <option value="all">Todos</option>
                <option value="draft">Rascunho</option>
                <option value="active">Ativo</option>
                <option value="paused">Pausado</option>
                <option value="closed">Encerrado</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-3">
            {filteredContracts.map((contract) => (
              <button
                key={contract.id}
                type="button"
                onClick={() => {
                  setSelectedClientId(contract.clientId);
                  setMessage(null);
                }}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left transition hover:bg-[var(--surface-2)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{contract.clientName}</div>
                    <div className="text-xs text-[var(--muted)]">
                      vencimento dia {contract.dueDay} • {contract.status}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{centsToCurrency(contract.monthlyFeeCents)}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                  <Tag label={contract.generateInvoice ? "NF" : "NF desligada"} />
                  <Tag label={contract.generateBoleto ? "Boleto" : "Boleto desligado"} />
                  <Tag label={contract.sendEmail ? "Email" : "Sem email"} />
                  <Tag label={contract.sendWhatsapp ? "WhatsApp" : "Sem WhatsApp"} />
                </div>
              </button>
            ))}
            {!filteredContracts.length ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">
                Nenhum contrato encontrado.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Editar contrato</div>
            <div className="mt-1 text-xl font-semibold">{selectedClient ? selectedClient.name : "Selecione um cliente"}</div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Cliente</span>
                <select
                  value={form.clientId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedClientId(next);
                    const existing = overview?.contracts.find((item) => item.clientId === next);
                    const client = clients.find((item) => item.id === next);
                    setForm((prev) => ({
                      ...prev,
                      clientId: next,
                      status: existing?.status ?? "draft",
                      monthlyFee: existing ? (existing.monthlyFeeCents / 100).toFixed(2).replace(".", ",") : "",
                      dueDay: String(existing?.dueDay ?? 1),
                      contractStartDate: existing?.contractStartDate ?? monthStartIso(),
                      contractEndDate: existing?.contractEndDate ?? "",
                      billingEmail: existing?.billingEmail ?? client?.invoiceEmail ?? client?.email ?? "",
                      billingWhatsapp: existing?.billingWhatsapp ?? client?.whatsapp ?? client?.phone ?? "",
                      sendEmail: existing?.sendEmail ?? true,
                      sendWhatsapp: existing?.sendWhatsapp ?? true,
                      generateInvoice: existing?.generateInvoice ?? true,
                      generateBoleto: existing?.generateBoleto ?? true,
                      invoiceServiceCode: existing?.invoiceServiceCode ?? client?.serviceCode ?? "",
                      invoiceServiceDescription: existing?.invoiceServiceDescription ?? client?.serviceDescription ?? "",
                      notes: existing?.notes ?? client?.notes ?? "",
                    }));
                  }}
                  className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm"
                >
                  <option value="">Selecionar cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Status</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as ContractItem["status"] }))}
                    className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm"
                  >
                    <option value="draft">Rascunho</option>
                    <option value="active">Ativo</option>
                    <option value="paused">Pausado</option>
                    <option value="closed">Encerrado</option>
                  </select>
                </label>
                <Field label="Honorário" value={form.monthlyFee} onChange={(next) => setForm((prev) => ({ ...prev, monthlyFee: next }))} placeholder="Ex.: 2.500,00" />
                <Field label="Vencimento" value={form.dueDay} onChange={(next) => setForm((prev) => ({ ...prev, dueDay: next }))} type="number" />
                <Field label="Início" value={form.contractStartDate} onChange={(next) => setForm((prev) => ({ ...prev, contractStartDate: next }))} type="date" />
                <Field label="Fim" value={form.contractEndDate} onChange={(next) => setForm((prev) => ({ ...prev, contractEndDate: next }))} type="date" />
                <Field label="E-mail cobrança" value={form.billingEmail} onChange={(next) => setForm((prev) => ({ ...prev, billingEmail: next }))} placeholder="cobranca@cliente.com" />
                <Field label="WhatsApp cobrança" value={form.billingWhatsapp} onChange={(next) => setForm((prev) => ({ ...prev, billingWhatsapp: next }))} placeholder="(54) 99999-9999" />
                <Field label="Código do serviço" value={form.invoiceServiceCode} onChange={(next) => setForm((prev) => ({ ...prev, invoiceServiceCode: next }))} />
                <Field label="Descrição do serviço" value={form.invoiceServiceDescription} onChange={(next) => setForm((prev) => ({ ...prev, invoiceServiceDescription: next }))} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Toggle label="Enviar por e-mail" checked={form.sendEmail} onChange={(next) => setForm((prev) => ({ ...prev, sendEmail: next }))} />
                <Toggle label="Enviar por WhatsApp" checked={form.sendWhatsapp} onChange={(next) => setForm((prev) => ({ ...prev, sendWhatsapp: next }))} />
                <Toggle label="Gerar nota" checked={form.generateInvoice} onChange={(next) => setForm((prev) => ({ ...prev, generateInvoice: next }))} />
                <Toggle label="Gerar boleto" checked={form.generateBoleto} onChange={(next) => setForm((prev) => ({ ...prev, generateBoleto: next }))} />
              </div>

              <label className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Observações</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="min-h-[120px] rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm"
                />
              </label>

              <button
                type="button"
                onClick={() => void saveContract()}
                disabled={saving}
                className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar contrato"}
              </button>
            </div>
          </div>

          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Cobertura</div>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Cliente" value={selectedClient?.name ?? "—"} />
              <InfoRow label="Documento" value={selectedClient?.document ?? "—"} />
              <InfoRow label="Município fiscal" value={selectedClient?.fiscalCity && selectedClient?.fiscalState ? `${selectedClient.fiscalCity}/${selectedClient.fiscalState}` : "—"} />
              <InfoRow label="Regime" value={selectedClient?.taxRegime ?? "—"} />
              <InfoRow label="Serviço" value={selectedClient?.serviceDescription ?? "—"} />
              <InfoRow label="E-mail de nota" value={selectedClient?.invoiceEmail ?? selectedClient?.email ?? "—"} />
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Serviços fiscais</div>
            <div className="mt-1 text-xl font-semibold">Catálogo auxiliar</div>
          </div>
          <div className="text-xs text-[var(--muted)]">Atualizado por serviço</div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(overview?.services ?? []).slice(0, 6).map((service) => (
            <div key={service.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{service.name}</div>
                  <div className="text-xs text-[var(--muted)]">{service.code}</div>
                </div>
                <Tag label={service.active ? "Ativo" : "Inativo"} />
              </div>
              <div className="mt-2 text-sm text-[var(--muted)]">{service.description ?? "Sem descrição."}</div>
            </div>
          ))}
        </div>
      </section>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="text-right text-sm font-medium">{value}</div>
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px]">{label}</span>;
}
