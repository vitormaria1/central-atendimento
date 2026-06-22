"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { centsToCurrency } from "@/lib/finance";

type Agent = { agentId: "vanderlei" | "gustavo"; agentName: "Vanderlei" | "Gustavo" };

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
  createdAt: string;
  updatedAt: string;
};

type ContractItem = {
  id: string;
  clientId: string;
  clientName: string;
  status: "draft" | "active" | "paused" | "closed";
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
};

type FiscalOverview = {
  metrics: {
    activeContracts: number;
    invoiceReady: number;
    cyclesPending: number;
    servicesActive: number;
    nextCompetenceMonth: string;
  };
  contracts: ContractItem[];
};

type ClientDraft = {
  name: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  whatsapp: string;
  contactName: string;
  contactRole: string;
  addressLine: string;
  addressNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  municipalRegistration: string;
  stateRegistration: string;
  taxRegime: string;
  fiscalCity: string;
  fiscalState: string;
  invoiceEmail: string;
  serviceCode: string;
  serviceDescription: string;
  notes: string;
};

function emptyDraft(): ClientDraft {
  return {
    name: "",
    legalName: "",
    document: "",
    email: "",
    phone: "",
    whatsapp: "",
    contactName: "",
    contactRole: "",
    addressLine: "",
    addressNumber: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
    municipalRegistration: "",
    stateRegistration: "",
    taxRegime: "",
    fiscalCity: "",
    fiscalState: "",
    invoiceEmail: "",
    serviceCode: "",
    serviceDescription: "",
    notes: "",
  };
}

function toDraft(client: ClientItem): ClientDraft {
  return {
    name: client.name ?? "",
    legalName: client.legalName ?? "",
    document: client.document ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    whatsapp: client.whatsapp ?? "",
    contactName: client.contactName ?? "",
    contactRole: client.contactRole ?? "",
    addressLine: client.addressLine ?? "",
    addressNumber: client.addressNumber ?? "",
    neighborhood: client.neighborhood ?? "",
    city: client.city ?? "",
    state: client.state ?? "",
    zipCode: client.zipCode ?? "",
    municipalRegistration: client.municipalRegistration ?? "",
    stateRegistration: client.stateRegistration ?? "",
    taxRegime: client.taxRegime ?? "",
    fiscalCity: client.fiscalCity ?? "",
    fiscalState: client.fiscalState ?? "",
    invoiceEmail: client.invoiceEmail ?? "",
    serviceCode: client.serviceCode ?? "",
    serviceDescription: client.serviceDescription ?? "",
    notes: client.notes ?? "",
  };
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function payloadFromDraft(draft: ClientDraft) {
  return {
    name: draft.name.trim(),
    legalName: draft.legalName.trim(),
    document: draft.document.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    whatsapp: draft.whatsapp.trim(),
    contactName: draft.contactName.trim(),
    contactRole: draft.contactRole.trim(),
    addressLine: draft.addressLine.trim(),
    addressNumber: draft.addressNumber.trim(),
    neighborhood: draft.neighborhood.trim(),
    city: draft.city.trim(),
    state: draft.state.trim(),
    zipCode: draft.zipCode.trim(),
    municipalRegistration: draft.municipalRegistration.trim(),
    stateRegistration: draft.stateRegistration.trim(),
    taxRegime: draft.taxRegime.trim(),
    fiscalCity: draft.fiscalCity.trim(),
    fiscalState: draft.fiscalState.trim(),
    invoiceEmail: draft.invoiceEmail.trim(),
    serviceCode: draft.serviceCode.trim(),
    serviceDescription: draft.serviceDescription.trim(),
    notes: draft.notes.trim(),
  };
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
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
      />
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}

function isClientReadyForInvoice(client: ClientItem, contract: ContractItem | null) {
  if (!contract || contract.status !== "active" || !contract.generateInvoice) return false;
  return Boolean(client.document && client.invoiceEmail && client.fiscalCity && client.fiscalState && client.serviceCode);
}

export default function ClientsShell() {
  const [me, setMe] = useState<Agent | null>(null);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [fiscalOverview, setFiscalOverview] = useState<FiscalOverview | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [draft, setDraft] = useState<ClientDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedClient = clients.find((item) => item.id === selectedClientId) ?? null;
  const isEditing = Boolean(selectedClient);

  const contractByClientId = useMemo(() => {
    const map = new Map<string, ContractItem>();
    for (const contract of fiscalOverview?.contracts ?? []) map.set(contract.clientId, contract);
    return map;
  }, [fiscalOverview]);

  const totalClients = clients.length;
  const clientsWithFiscalProfile = clients.filter((client) =>
    Boolean(client.document && client.taxRegime && client.fiscalCity && client.fiscalState && client.invoiceEmail),
  ).length;
  const clientsWithContract = clients.filter((client) => contractByClientId.has(client.id)).length;
  const clientsWithActiveContract = clients.filter((client) => contractByClientId.get(client.id)?.status === "active").length;
  const clientsReadyForInvoice = clients.filter((client) => {
    const contract = contractByClientId.get(client.id);
    return Boolean(contract?.status === "active" && contract.generateInvoice && client.invoiceEmail && client.serviceCode);
  }).length;

  async function loadMe() {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as Agent;
    setMe(data);
  }

  async function loadFiscalOverview() {
    const res = await fetch("/api/fiscal/overview", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as FiscalOverview;
    setFiscalOverview(data);
  }

  async function loadClients(query?: string, preferredId?: string | null) {
    setLoading(true);
    try {
      const url = new URL("/api/clients", window.location.origin);
      url.searchParams.set("limit", "120");
      const q = (query ?? search).trim();
      if (q) url.searchParams.set("q", q);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error("Falha ao carregar clientes");
      const data = (await res.json()) as { items: ClientItem[] };
      const next = data.items ?? [];
      setClients(next);

      const nextSelectedId =
        preferredId && next.some((item) => item.id === preferredId)
          ? preferredId
          : selectedClientId && next.some((item) => item.id === selectedClientId)
            ? selectedClientId
            : next[0]?.id ?? null;

      setSelectedClientId(nextSelectedId);
      setDraft(nextSelectedId ? toDraft(next.find((item) => item.id === nextSelectedId)!) : emptyDraft());
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMe();
    void loadFiscalOverview();
    void loadClients("", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedClient) setDraft(toDraft(selectedClient));
    else setDraft(emptyDraft());
  }, [selectedClient]);

  function updateDraft<K extends keyof ClientDraft>(key: K, value: ClientDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function saveClient() {
    const payload = payloadFromDraft(draft);
    if (!payload.name) {
      setToast("Informe ao menos o nome do cliente.");
      return;
    }

    setSaving(true);
    setToast(null);
    try {
      if (selectedClient) {
        const res = await fetch(`/api/clients/${encodeURIComponent(selectedClient.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Falha ao atualizar cliente");
        await loadClients(search, selectedClient.id);
        setToast("Cliente atualizado.");
      } else {
        const res = await fetch("/api/clients", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => null)) as { id?: string } | null;
        if (!res.ok || !data?.id) throw new Error("Falha ao criar cliente");
        await loadClients(search, data.id);
        setToast("Cliente criado.");
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao salvar cliente");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 py-4 md:px-6">
        <div className="rounded-[32px] border border-[var(--border)] bg-[var(--surface-1)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Central de Inteligência</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Clientes</h1>
              <div className="mt-2 text-sm text-[var(--muted)]">Cadastro fiscal, comercial e operacional no mesmo fluxo.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/financeiro/contratos" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm hover:bg-[var(--surface-1)]">
                Contratos
              </Link>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--muted)]">
                {me ? me.agentName : "Carregando..."}
              </div>
              <Link href="/" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm hover:bg-[var(--surface-1)]">
                Voltar
              </Link>
            </div>
          </div>

          <div className="grid min-h-[calc(100vh-10rem)] grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="border-b border-[var(--border)] bg-[var(--surface-2)] xl:border-b-0 xl:border-r">
              <div className="border-b border-[var(--border)] px-5 py-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMetric label="Clientes" value={`${totalClients}`} />
                  <MiniMetric label="Com contrato" value={`${clientsWithContract}`} />
                  <MiniMetric label="Cadastro fiscal" value={`${clientsWithFiscalProfile}`} />
                  <MiniMetric label="Prontos para NF" value={`${clientsReadyForInvoice}`} />
                </div>
                <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-xs text-[var(--muted)]">
                  {fiscalOverview?.metrics.activeContracts ?? 0} contratos ativos • {clientsWithActiveContract} clientes com contrato ativo • {fiscalOverview?.metrics.invoiceReady ?? 0} prontos para emissão
                </div>
                <div className="mt-4 flex gap-2">
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const next = searchInput.trim();
                        setSearch(next);
                        void loadClients(next, null);
                      }
                    }}
                    placeholder="Buscar por nome, razão social ou documento"
                    className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = searchInput.trim();
                      setSearch(next);
                      void loadClients(next, null);
                    }}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm hover:bg-[var(--surface-2)]"
                  >
                    Buscar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientId(null);
                    setDraft(emptyDraft());
                    setToast(null);
                  }}
                  className="mt-3 w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white"
                >
                  Novo cliente
                </button>
              </div>

              <div className="max-h-[calc(100vh-17rem)] overflow-y-auto p-3">
                {loading ? (
                  <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-5 text-sm text-[var(--muted)]">
                    Carregando clientes...
                  </div>
                ) : clients.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-4 py-5 text-sm text-[var(--muted)]">
                    Nenhum cliente encontrado.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(client.id);
                          setToast(null);
                        }}
                        className={[
                          "w-full rounded-[24px] border px-4 py-4 text-left transition",
                          client.id === selectedClientId
                            ? "border-[color-mix(in_srgb,var(--primary)_35%,white)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface-1))]"
                            : "border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{client.name}</div>
                            <div className="mt-1 truncate text-xs text-[var(--muted)]">
                              {client.legalName || client.document || "Sem detalhes complementares"}
                            </div>
                          </div>
                          <div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[10px] text-[var(--muted)]">
                            #{client.id}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                          {client.phone ? <span>{client.phone}</span> : null}
                          {client.city ? <span>{client.city}</span> : null}
                          {client.state ? <span>{client.state}</span> : null}
                          {contractByClientId.get(client.id) ? (
                            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
                              {contractByClientId.get(client.id)?.status}
                            </span>
                          ) : (
                            <span className="rounded-full border border-dashed border-[var(--border)] px-2 py-1">Sem contrato</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <main className="min-w-0 bg-[var(--surface-1)] px-6 py-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    {isEditing ? "Editar cliente" : "Novo cliente"}
                  </div>
                  <div className="mt-2 text-2xl font-semibold">{isEditing ? selectedClient?.name : "Cadastro de cliente"}</div>
                  {selectedClient ? (
                    <div className="mt-2 text-sm text-[var(--muted)]">
                      Criado em {formatDateTime(selectedClient.createdAt)} • Atualizado em {formatDateTime(selectedClient.updatedAt)}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-[var(--muted)]">Preencha os dados principais do cliente para reutilizar em tarefas e operação.</div>
                  )}
                </div>
                {toast ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--foreground)]">
                    {toast}
                  </div>
                ) : null}
              </div>

              {selectedClient ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                  <InfoCard label="Contrato" value={contractByClientId.get(selectedClient.id)?.status ?? "Sem contrato"} />
                  <InfoCard label="Honorário" value={centsToCurrency(contractByClientId.get(selectedClient.id)?.monthlyFeeCents ?? 0)} />
                  <InfoCard label="Vencimento" value={contractByClientId.get(selectedClient.id)?.dueDay ? `Dia ${contractByClientId.get(selectedClient.id)?.dueDay}` : "—"} />
                  <InfoCard
                    label="Cobertura"
                    value={isClientReadyForInvoice(selectedClient, contractByClientId.get(selectedClient.id) ?? null) ? "Pronto para NF" : "Pendente"}
                  />
                </div>
              ) : null}

              <div className="mt-6 grid gap-6">
                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <div className="text-sm font-semibold">Identificação</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="Nome" value={draft.name} onChange={(v) => updateDraft("name", v)} placeholder="Nome do cliente" />
                    <Field label="Razão social" value={draft.legalName} onChange={(v) => updateDraft("legalName", v)} placeholder="Razão social" />
                    <Field label="CPF/CNPJ" value={draft.document} onChange={(v) => updateDraft("document", v)} placeholder="Documento" />
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <div className="text-sm font-semibold">Contato</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="E-mail" value={draft.email} onChange={(v) => updateDraft("email", v)} placeholder="email@cliente.com" />
                    <Field label="Telefone" value={draft.phone} onChange={(v) => updateDraft("phone", v)} placeholder="Telefone principal" />
                    <Field label="WhatsApp" value={draft.whatsapp} onChange={(v) => updateDraft("whatsapp", v)} placeholder="WhatsApp" />
                    <Field label="Contato principal" value={draft.contactName} onChange={(v) => updateDraft("contactName", v)} placeholder="Nome do contato" />
                    <Field label="Cargo do contato" value={draft.contactRole} onChange={(v) => updateDraft("contactRole", v)} placeholder="Ex.: Financeiro" />
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <div className="text-sm font-semibold">Endereço</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="md:col-span-2 xl:col-span-2">
                      <Field label="Logradouro" value={draft.addressLine} onChange={(v) => updateDraft("addressLine", v)} placeholder="Rua, avenida, etc." />
                    </div>
                    <Field label="Número" value={draft.addressNumber} onChange={(v) => updateDraft("addressNumber", v)} placeholder="Número" />
                    <Field label="Bairro" value={draft.neighborhood} onChange={(v) => updateDraft("neighborhood", v)} placeholder="Bairro" />
                    <Field label="Cidade" value={draft.city} onChange={(v) => updateDraft("city", v)} placeholder="Cidade" />
                    <Field label="Estado" value={draft.state} onChange={(v) => updateDraft("state", v)} placeholder="UF/Estado" />
                    <Field label="CEP" value={draft.zipCode} onChange={(v) => updateDraft("zipCode", v)} placeholder="CEP" />
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <div className="text-sm font-semibold">Perfil fiscal</div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Field
                      label="Inscrição municipal"
                      value={draft.municipalRegistration}
                      onChange={(v) => updateDraft("municipalRegistration", v)}
                      placeholder="IM"
                    />
                    <Field
                      label="Inscrição estadual"
                      value={draft.stateRegistration}
                      onChange={(v) => updateDraft("stateRegistration", v)}
                      placeholder="IE"
                    />
                    <Field label="Regime tributário" value={draft.taxRegime} onChange={(v) => updateDraft("taxRegime", v)} placeholder="Simples, Presumido..." />
                    <Field label="Cidade fiscal" value={draft.fiscalCity} onChange={(v) => updateDraft("fiscalCity", v)} placeholder="Cidade de emissão" />
                    <Field label="UF fiscal" value={draft.fiscalState} onChange={(v) => updateDraft("fiscalState", v)} placeholder="UF" />
                    <Field label="E-mail NF" value={draft.invoiceEmail} onChange={(v) => updateDraft("invoiceEmail", v)} placeholder="E-mail para nota" />
                    <Field label="Código do serviço" value={draft.serviceCode} onChange={(v) => updateDraft("serviceCode", v)} placeholder="Código fiscal" />
                    <Field
                      label="Descrição do serviço"
                      value={draft.serviceDescription}
                      onChange={(v) => updateDraft("serviceDescription", v)}
                      placeholder="Serviço padrão"
                    />
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <div className="text-sm font-semibold">Observações</div>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => updateDraft("notes", e.target.value)}
                    rows={6}
                    placeholder="Informações relevantes sobre o cliente, rotina, documentos, observações comerciais, etc."
                    className="mt-4 w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
                  />
                </section>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void saveClient()}
                    disabled={saving}
                    className="rounded-2xl bg-[var(--primary)] px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar cliente"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedClient) setDraft(toDraft(selectedClient));
                      else setDraft(emptyDraft());
                      setToast(null);
                    }}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm hover:bg-[var(--surface-1)]"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
