"use client";

import Link from "next/link";
import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { centsToCurrency, monthStartIso, todayIso } from "@/lib/finance";

type FiscalSection = "dashboard" | "invoice" | "services" | "alerts" | "cycles" | "clients" | "financeiro";

type ClientItem = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  fiscalCity: string | null;
  fiscalState: string | null;
  invoiceEmail: string | null;
  serviceCode: string | null;
  serviceDescription: string | null;
  taxRegime: string | null;
};

type Overview = {
  metrics: {
    activeContracts: number;
    invoiceReady: number;
    cyclesPending: number;
    servicesActive: number;
    nextCompetenceMonth: string;
  };
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

const sectionItems: Array<{ section: FiscalSection; label: string; href: string }> = [
  { section: "dashboard", label: "Visão geral", href: "/fiscal" },
  { section: "invoice", label: "Emissão de nota", href: "/fiscal/invoice" },
  { section: "services", label: "Serviços", href: "/fiscal/services" },
  { section: "alerts", label: "Alertas", href: "/fiscal/alerts" },
  { section: "cycles", label: "Ciclos", href: "/fiscal/cycles" },
  { section: "clients", label: "Clientes", href: "/fiscal/clients" },
  { section: "financeiro", label: "Financeiro", href: "/fiscal/financeiro" },
];

const emptyService = {
  code: "",
  name: "",
  description: "",
  municipalCode: "",
  cnae: "",
  taxRegime: "",
  active: true,
};

const emptyInvoice = {
  clientId: "",
  competenceMonth: monthStartIso(),
  amount: "",
  serviceDescription: "",
  itemListaServico: "4.12",
  tomadorNome: "",
  tomadorDocumento: "",
  tomadorEmail: "",
  tomadorTelefone: "",
  tomadorLogradouro: "",
  tomadorNumero: "",
  tomadorComplemento: "",
  tomadorBairro: "",
  tomadorCidade: "",
  tomadorUf: "SC",
  tomadorCep: "",
  dataEmissao: todayIso(),
};

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function FiscalShell({ section }: { section: FiscalSection }) {
  const [me, setMe] = useState<{ agentName: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);
  const [loading, setLoading] = useState(true);
  const [savingService, setSavingService] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedClient = clients.find((client) => client.id === invoiceForm.clientId) ?? null;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const wantsOverview = section === "dashboard" || section === "invoice" || section === "services" || section === "alerts" || section === "cycles";
      if (wantsOverview) {
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
        return;
      }

      const [clientsRes, meRes] = await Promise.all([
        fetch("/api/clients?limit=200", { cache: "no-store" }),
        fetch("/api/me", { cache: "no-store" }),
      ]);
      if (clientsRes.ok) {
        const data = (await clientsRes.json()) as { items: ClientItem[] };
        setClients(data.items ?? []);
      }
      if (meRes.ok) setMe((await meRes.json()) as { agentName: string });
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  async function saveInvoice() {
    if (!invoiceForm.clientId) {
      setToast("Selecione um cliente.");
      return;
    }
    setSavingInvoice(true);
    setToast(null);
    try {
      const res = await fetch("/api/fiscal/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: Number(invoiceForm.clientId),
          competenceMonth: invoiceForm.competenceMonth,
          amountCents: invoiceForm.amount ? Math.round(Number.parseFloat(invoiceForm.amount.replace(",", ".")) * 100) : undefined,
          serviceDescription: invoiceForm.serviceDescription || null,
          itemListaServico: invoiceForm.itemListaServico || null,
          tomadorNome: invoiceForm.tomadorNome || null,
          tomadorDocumento: invoiceForm.tomadorDocumento || null,
          tomadorEmail: invoiceForm.tomadorEmail || null,
          tomadorTelefone: invoiceForm.tomadorTelefone || null,
          tomadorLogradouro: invoiceForm.tomadorLogradouro || null,
          tomadorNumero: invoiceForm.tomadorNumero || null,
          tomadorComplemento: invoiceForm.tomadorComplemento || null,
          tomadorBairro: invoiceForm.tomadorBairro || null,
          tomadorCidade: invoiceForm.tomadorCidade || null,
          tomadorUf: invoiceForm.tomadorUf || null,
          tomadorCep: invoiceForm.tomadorCep || null,
        }),
      });
      if (!res.ok) throw new Error("Falha ao gerar nota");
      setToast("Nota gerada.");
      setInvoiceForm(emptyInvoice);
      await loadData();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao gerar nota");
    } finally {
      setSavingInvoice(false);
    }
  }

  function applyClientPreset(clientId: string) {
    const client = clients.find((item) => item.id === clientId) ?? null;
    setInvoiceForm((prev) => ({
      ...prev,
      clientId,
      tomadorNome: client?.name ?? "",
      tomadorDocumento: client?.document ?? "",
      tomadorEmail: client?.invoiceEmail ?? client?.email ?? "",
      tomadorTelefone: client?.whatsapp ?? client?.phone ?? "",
      tomadorLogradouro: client?.addressLine ?? "",
      tomadorNumero: client?.addressNumber ?? "",
      tomadorBairro: client?.neighborhood ?? "",
      tomadorCidade: client?.fiscalCity ?? client?.city ?? "",
      tomadorUf: client?.fiscalState ?? client?.state ?? "SC",
      tomadorCep: client?.zipCode ?? "",
      serviceDescription: client?.serviceDescription ?? prev.serviceDescription,
      itemListaServico: client?.serviceCode ?? prev.itemListaServico,
    }));
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Fiscal</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gestão fiscal e contratos</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Estrutura de operação fiscal, emissão e acompanhamento.</p>
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

        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:self-start">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Navegação</div>
            <div className="mt-4 space-y-2">
              {sectionItems.map((item) => {
                const active = item.section === section;
                return (
                  <Link
                    key={item.section}
                    href={item.href}
                    className={[
                      "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                      active
                        ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]"
                        : "border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{item.label}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Abrir</span>
                  </Link>
                );
              })}
            </div>
          </aside>

          <main className="min-w-0 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Contratos ativos" value={`${overview?.metrics.activeContracts ?? 0}`} />
              <Metric label="Notas prontas" value={`${overview?.metrics.invoiceReady ?? 0}`} />
              <Metric label="Ciclos pendentes" value={`${overview?.metrics.cyclesPending ?? 0}`} />
              <Metric label="Serviços ativos" value={`${overview?.metrics.servicesActive ?? 0}`} />
            </div>

            {section === "dashboard" ? <DashboardView nextCompetenceMonth={overview?.metrics.nextCompetenceMonth ?? "—"} /> : null}
            {section === "invoice" ? (
              <InvoiceView
                clients={clients}
                selectedClient={selectedClient}
                invoiceForm={invoiceForm}
                savingInvoice={savingInvoice}
                onChange={setInvoiceForm}
                onPickClient={applyClientPreset}
                onSave={saveInvoice}
              />
            ) : null}
            {section === "services" ? (
              <ServicesView
                services={overview?.services ?? []}
                serviceForm={serviceForm}
                savingService={savingService}
                onChange={setServiceForm}
                onSave={saveService}
              />
            ) : null}
            {section === "alerts" ? <AlertsView /> : null}
            {section === "cycles" ? <CyclesView cycles={overview?.cycles ?? []} /> : null}
            {section === "clients" ? <SimpleRedirectView title="Clientes" href="/clients" text="Abrir cadastro fiscal completo dos clientes." /> : null}
            {section === "financeiro" ? <SimpleRedirectView title="Financeiro" href="/financeiro" text="Abrir contratos, cobrança e serviços avulsos." /> : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ nextCompetenceMonth }: { nextCompetenceMonth: string }) {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Fluxo fiscal</div>
          <div className="mt-1 text-xl font-semibold">Visão geral</div>
        </div>
        <div className="text-sm text-[var(--muted)]">Próximo ciclo: {nextCompetenceMonth}</div>
      </div>
    </section>
  );
}

function InvoiceView({
  clients,
  selectedClient,
  invoiceForm,
  savingInvoice,
  onChange,
  onPickClient,
  onSave,
}: {
  clients: ClientItem[];
  selectedClient: ClientItem | null;
  invoiceForm: typeof emptyInvoice;
  savingInvoice: boolean;
  onChange: Dispatch<SetStateAction<typeof emptyInvoice>>;
  onPickClient: (clientId: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Emissão de nota</div>
            <div className="mt-1 text-xl font-semibold">Nova NFS</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select value={invoiceForm.clientId} onChange={(e) => onPickClient(e.target.value)} className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm">
            <option value="">Selecionar cliente</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <Field label="Competência" value={invoiceForm.competenceMonth} onChange={(v) => onChange((prev) => ({ ...prev, competenceMonth: v }))} />
          <Field label="Valor" value={invoiceForm.amount} onChange={(v) => onChange((prev) => ({ ...prev, amount: v }))} placeholder="Ex.: 2500,00" />
          <Field label="Item" value={invoiceForm.itemListaServico} onChange={(v) => onChange((prev) => ({ ...prev, itemListaServico: v }))} />
          <Field label="Data" value={invoiceForm.dataEmissao} onChange={(v) => onChange((prev) => ({ ...prev, dataEmissao: v }))} />
          <textarea
            value={invoiceForm.serviceDescription}
            onChange={(e) => onChange((prev) => ({ ...prev, serviceDescription: e.target.value }))}
            placeholder="Descrição do serviço"
            className="min-h-[88px] rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm md:col-span-2"
          />
          <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
            <Field label="Nome" value={invoiceForm.tomadorNome} onChange={(v) => onChange((prev) => ({ ...prev, tomadorNome: v }))} />
            <Field label="Documento" value={invoiceForm.tomadorDocumento} onChange={(v) => onChange((prev) => ({ ...prev, tomadorDocumento: v }))} />
            <Field label="E-mail" value={invoiceForm.tomadorEmail} onChange={(v) => onChange((prev) => ({ ...prev, tomadorEmail: v }))} />
            <Field label="Telefone" value={invoiceForm.tomadorTelefone} onChange={(v) => onChange((prev) => ({ ...prev, tomadorTelefone: v }))} />
            <Field label="Logradouro" value={invoiceForm.tomadorLogradouro} onChange={(v) => onChange((prev) => ({ ...prev, tomadorLogradouro: v }))} />
            <Field label="Número" value={invoiceForm.tomadorNumero} onChange={(v) => onChange((prev) => ({ ...prev, tomadorNumero: v }))} />
            <Field label="Bairro" value={invoiceForm.tomadorBairro} onChange={(v) => onChange((prev) => ({ ...prev, tomadorBairro: v }))} />
            <Field label="Cidade" value={invoiceForm.tomadorCidade} onChange={(v) => onChange((prev) => ({ ...prev, tomadorCidade: v }))} />
            <Field label="UF" value={invoiceForm.tomadorUf} onChange={(v) => onChange((prev) => ({ ...prev, tomadorUf: v }))} />
            <Field label="CEP" value={invoiceForm.tomadorCep} onChange={(v) => onChange((prev) => ({ ...prev, tomadorCep: v }))} />
          </div>
          <input
            value={invoiceForm.tomadorComplemento}
            onChange={(e) => onChange((prev) => ({ ...prev, tomadorComplemento: e.target.value }))}
            placeholder="Complemento"
            className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm md:col-span-2"
          />
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={savingInvoice}
            className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60 md:col-span-2"
          >
            {savingInvoice ? "Gerando..." : "Gerar nota"}
          </button>
        </div>
      </section>

      <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Cliente</div>
        <div className="mt-1 text-xl font-semibold">{selectedClient?.name ?? "Selecione um cliente"}</div>
        <div className="mt-4 grid gap-3">
          <InfoLine label="Documento" value={selectedClient?.document ?? "—"} />
          <InfoLine label="Município fiscal" value={selectedClient?.fiscalCity && selectedClient?.fiscalState ? `${selectedClient.fiscalCity}/${selectedClient.fiscalState}` : "—"} />
          <InfoLine label="Regime" value={selectedClient?.taxRegime ?? "—"} />
          <InfoLine label="E-mail" value={selectedClient?.invoiceEmail ?? "—"} />
          <InfoLine label="Serviço" value={selectedClient?.serviceDescription ?? "—"} />
        </div>
      </section>
    </div>
  );
}

function ServicesView({
  services,
  serviceForm,
  savingService,
  onChange,
  onSave,
}: {
  services: Overview["services"];
  serviceForm: typeof emptyService;
  savingService: boolean;
  onChange: Dispatch<SetStateAction<typeof emptyService>>;
  onSave: () => void;
}) {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Serviços</div>
      <div className="mt-1 text-xl font-semibold">Catálogo de serviços</div>
      <div className="mt-4 grid gap-3">
        <Field label="Código" value={serviceForm.code} onChange={(v) => onChange((prev) => ({ ...prev, code: v }))} />
        <Field label="Nome" value={serviceForm.name} onChange={(v) => onChange((prev) => ({ ...prev, name: v }))} />
        <Field label="Código municipal" value={serviceForm.municipalCode} onChange={(v) => onChange((prev) => ({ ...prev, municipalCode: v }))} />
        <Field label="CNAE" value={serviceForm.cnae} onChange={(v) => onChange((prev) => ({ ...prev, cnae: v }))} />
        <Field label="Regime tributário" value={serviceForm.taxRegime} onChange={(v) => onChange((prev) => ({ ...prev, taxRegime: v }))} />
        <textarea
          value={serviceForm.description}
          onChange={(e) => onChange((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Descrição do serviço"
          className="min-h-[92px] rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm"
        />
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={savingService}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
        >
          {savingService ? "Salvando..." : "Salvar serviço"}
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {services.map((service) => (
          <div key={service.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{service.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {service.code} · {service.active ? "ativo" : "inativo"}
                </div>
              </div>
              <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)]">{service.taxRegime || "sem regime"}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AlertsView() {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Alertas</div>
      <div className="mt-1 text-xl font-semibold">Pendências e qualidade dos dados</div>
      <div className="mt-4 text-sm text-[var(--muted)]">Aqui entram validações de cadastro, inconsistências de emissão e acompanhamento de retorno.</div>
    </section>
  );
}

function CyclesView({ cycles }: { cycles: Overview["cycles"] }) {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Ciclos</div>
      <div className="mt-1 text-xl font-semibold">Execuções mensais</div>
      <div className="mt-4 space-y-3">
        {cycles.map((cycle) => (
          <div key={cycle.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{formatDate(`${cycle.competenceMonth}T00:00:00`)}</div>
                <div className="text-xs text-[var(--muted)]">
                  {cycle.status} · {cycle.itemCount} itens
                </div>
              </div>
              <div className="text-sm font-semibold">{centsToCurrency(cycle.totalCents)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimpleRedirectView({ title, text, href }: { title: string; text: string; href: string }) {
  return (
    <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{title}</div>
      <div className="mt-1 text-xl font-semibold">{text}</div>
      <Link href={href} className="mt-4 inline-flex rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
        Abrir agora
      </Link>
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="text-right text-sm font-medium">{value}</div>
    </div>
  );
}
