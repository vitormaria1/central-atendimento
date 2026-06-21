"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { centsToCurrency, monthStartIso, todayIso } from "@/lib/finance";

type ClientItem = {
  id: string;
  name: string;
  document: string | null;
  taxRegime: string | null;
  fiscalCity: string | null;
  fiscalState: string | null;
  invoiceEmail: string | null;
  municipalRegistration: string | null;
  stateRegistration: string | null;
  serviceCode: string | null;
  serviceDescription: string | null;
};

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
    clientId: string;
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
    updatedAt: string;
  }>;
  entries: Array<{
    id: string;
    clientId: string | null;
    clientName: string | null;
    kind: string;
    sourceType: string;
    sourceLabel: string;
    competenceMonth: string | null;
    dueDate: string | null;
    amountCents: number;
    status: string;
    paidAt: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  extraServices: Array<{
    id: string;
    clientId: string;
    clientName: string;
    description: string;
    amountCents: number;
    status: string;
    competenceMonth: string;
    serviceDate: string;
    createdAt: string;
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

const emptyAvulso = {
  clientId: "",
  description: "",
  amount: "",
  competenceMonth: monthStartIso(),
  serviceDate: todayIso(),
};

export default function FinanceiroShell() {
  const [me, setMe] = useState<{ agentName: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [contractForm, setContractForm] = useState(emptyContract);
  const [avulso, setAvulso] = useState(emptyAvulso);
  const [loading, setLoading] = useState(true);
  const [savingContract, setSavingContract] = useState(false);
  const [savingAvulso, setSavingAvulso] = useState(false);
  const [runningCycle, setRunningCycle] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const selectedClient = clients.find((client) => client.id === contractForm.clientId) ?? null;

  async function loadData() {
    setLoading(true);
    try {
      const [overviewRes, clientsRes, meRes] = await Promise.all([
        fetch("/api/financeiro/overview", { cache: "no-store" }),
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

  async function saveAvulso() {
    if (!avulso.clientId || !avulso.description.trim() || !avulso.amount.trim()) {
      setToast("Preencha cliente, descrição e valor.");
      return;
    }

    setSavingAvulso(true);
    setToast(null);
    try {
      const res = await fetch("/api/financeiro/extra-services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: Number(avulso.clientId),
          description: avulso.description,
          amountCents: Math.round(Number.parseFloat(avulso.amount.replace(",", ".")) * 100),
          competenceMonth: avulso.competenceMonth,
          serviceDate: avulso.serviceDate,
        }),
      });
      if (!res.ok) throw new Error("Falha ao registrar serviço avulso");
      setToast("Serviço avulso registrado.");
      setAvulso(emptyAvulso);
      await loadData();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao registrar serviço avulso");
    } finally {
      setSavingAvulso(false);
    }
  }

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

  async function runCycle() {
    setRunningCycle(true);
    setToast(null);
    try {
      const res = await fetch("/api/financeiro/cycles/run", { method: "POST" });
      if (!res.ok) throw new Error("Falha ao gerar ciclo");
      const data = (await res.json()) as { competenceMonth?: string; itemsCreated?: number };
      setToast(`Ciclo gerado para ${data.competenceMonth ?? "o mês atual"} (${data.itemsCreated ?? 0} itens).`);
      await loadData();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao gerar ciclo");
    } finally {
      setRunningCycle(false);
    }
  }

  async function markPaid(entryId: string) {
    setPayingId(entryId);
    setToast(null);
    try {
      const res = await fetch(`/api/financeiro/entries/${encodeURIComponent(entryId)}/pay`, { method: "PATCH" });
      if (!res.ok) throw new Error("Falha ao marcar como pago");
      setToast("Lançamento quitado.");
      await loadData();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao marcar como pago");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Financeiro</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gestão financeira e cobranças</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
              Controle de honorários, serviços avulsos, recebimentos e base para integração com o Banco Inter.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void runCycle()}
              disabled={runningCycle}
              className="rounded-2xl bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {runningCycle ? "Gerando ciclo..." : "Gerar ciclo do mês"}
            </button>
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
            Carregando painel financeiro...
          </div>
        ) : null}

        {toast ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{toast}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Em aberto" value={`${overview?.metrics.openReceivables ?? 0}`} />
          <Metric label="Atrasados" value={`${overview?.metrics.overdueReceivables ?? 0}`} />
          <Metric label="Avulsos abertos" value={`${overview?.metrics.openAvulsos ?? 0}`} />
          <Metric label="Em aberto R$" value={centsToCurrency(overview?.metrics.totalOpenCents ?? 0)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
          <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Contratos</div>
            <div className="mt-1 text-xl font-semibold">Gestão de contrato por cliente</div>
            <div className="mt-2 text-sm text-[var(--muted)]">
              O contrato define honorário mensal, vencimento, emissão de nota e boleto.
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
              <Field label="Serviço da emissão" value={contractForm.focusServiceId} onChange={(v) => setContractForm((prev) => ({ ...prev, focusServiceId: v }))} />
              <Field label="Conta/Carteira Inter" value={contractForm.interWalletId} onChange={(v) => setContractForm((prev) => ({ ...prev, interWalletId: v }))} />
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

            {selectedClient ? (
              <div className="mt-4 rounded-[26px] border border-[var(--border)] bg-[var(--surface-1)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Perfil fiscal do cliente</div>
                <div className="mt-1 text-base font-semibold">{selectedClient.name}</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <InfoChip label="Documento" value={selectedClient.document ?? "Sem cadastro"} />
                  <InfoChip label="Município fiscal" value={selectedClient.fiscalCity && selectedClient.fiscalState ? `${selectedClient.fiscalCity}/${selectedClient.fiscalState}` : "Sem cadastro"} />
                  <InfoChip label="Regime tributário" value={selectedClient.taxRegime ?? "Sem cadastro"} />
                  <InfoChip label="Inscrição municipal" value={selectedClient.municipalRegistration ?? "Sem cadastro"} />
                  <InfoChip label="Inscrição estadual" value={selectedClient.stateRegistration ?? "Sem cadastro"} />
                  <InfoChip label="E-mail NF" value={selectedClient.invoiceEmail ?? "Sem cadastro"} />
                  <InfoChip label="Código do serviço" value={selectedClient.serviceCode ?? "Sem cadastro"} />
                  <InfoChip label="Descrição do serviço" value={selectedClient.serviceDescription ?? "Sem cadastro"} />
                </div>
              </div>
            ) : null}

            <div className="mt-6 overflow-hidden rounded-[26px] border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-semibold">Contratos ativos</div>
              <div className="max-h-[260px] overflow-auto">
                {(overview?.contracts ?? []).map((contract) => (
                  <div key={contract.id} className="grid gap-2 border-b border-[var(--border)] px-4 py-4 md:grid-cols-[1.2fr_0.7fr]">
                    <div>
                      <div className="font-semibold">{contract.clientName}</div>
                      <div className="text-xs text-[var(--muted)]">vence dia {contract.dueDay} · {contract.status}</div>
                    </div>
                    <div className="text-sm font-semibold">{centsToCurrency(contract.monthlyFeeCents)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Serviço avulso</div>
            <div className="mt-1 text-xl font-semibold">Adicionar ao honorário do mês</div>
            <div className="mt-4 grid gap-3">
              <select
                value={avulso.clientId}
                onChange={(e) => setAvulso((prev) => ({ ...prev, clientId: e.target.value }))}
                className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-3 text-sm"
              >
                <option value="">Selecionar cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <Field label="Descrição" value={avulso.description} onChange={(v) => setAvulso((prev) => ({ ...prev, description: v }))} placeholder="Ex.: reunião extra" />
              <Field label="Valor" value={avulso.amount} onChange={(v) => setAvulso((prev) => ({ ...prev, amount: v }))} placeholder="Ex.: 150,00" />
              <Field label="Competência" value={avulso.competenceMonth} onChange={(v) => setAvulso((prev) => ({ ...prev, competenceMonth: v }))} />
              <Field label="Data do serviço" value={avulso.serviceDate} onChange={(v) => setAvulso((prev) => ({ ...prev, serviceDate: v }))} />
              <button
                type="button"
                onClick={() => void saveAvulso()}
                disabled={savingAvulso}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
              >
                {savingAvulso ? "Salvando..." : "Registrar serviço avulso"}
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-[26px] border border-[var(--border)]">
              <div className="border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-semibold">Serviços avulsos</div>
              <div className="max-h-[420px] overflow-auto">
                {(overview?.extraServices ?? []).map((item) => (
                  <div key={item.id} className="border-b border-[var(--border)] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{item.clientName}</div>
                        <div className="text-xs text-[var(--muted)]">{item.description}</div>
                      </div>
                      <div className="text-sm font-semibold">{centsToCurrency(item.amountCents)}</div>
                    </div>
                    <div className="mt-2 text-xs text-[var(--muted)]">
                      {item.status} · competência {item.competenceMonth}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Lançamentos</div>
                  <div className="mt-1 text-xl font-semibold">Honorários e recebíveis</div>
                </div>
                <div className="text-sm text-[var(--muted)]">Competência atual: {overview?.metrics.currentCompetenceMonth ?? "—"}</div>
              </div>

              <div className="mt-4 overflow-hidden rounded-[26px] border border-[var(--border)]">
                <div className="max-h-[430px] overflow-auto">
                  {(overview?.entries ?? []).map((entry) => (
                    <div key={entry.id} className="grid gap-3 border-b border-[var(--border)] px-4 py-4 md:grid-cols-[1.2fr_0.7fr_0.7fr_auto] md:items-center">
                      <div>
                        <div className="font-semibold">{entry.clientName ?? "Sem cliente"}</div>
                        <div className="text-xs text-[var(--muted)]">{entry.sourceLabel}</div>
                      </div>
                      <div className="text-sm">{centsToCurrency(entry.amountCents)}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {entry.status} {entry.dueDate ? `· vence ${entry.dueDate}` : ""}
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        {entry.status !== "paid" ? (
                          <button
                            type="button"
                            onClick={() => void markPaid(entry.id)}
                            disabled={payingId === entry.id}
                            className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-xs hover:bg-[var(--surface-2)] disabled:opacity-60"
                          >
                            {payingId === entry.id ? "..." : "Marcar pago"}
                          </button>
                        ) : (
                          <span className="rounded-full border border-[color-mix(in_srgb,var(--primary)_28%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-3 py-2 text-xs">
                            Pago
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
                        <div className="font-semibold">{cycle.competenceMonth}</div>
                        <div className="text-xs text-[var(--muted)]">{cycle.status} · {cycle.itemCount} itens</div>
                      </div>
                      <div className="text-sm font-semibold">{centsToCurrency(cycle.totalCents)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Contratos financeiros</div>
              <div className="mt-1 text-xl font-semibold">Base de cobrança</div>
              <div className="mt-4 space-y-3">
                {(overview?.contracts ?? []).map((contract) => (
                  <div key={contract.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{contract.clientName}</div>
                        <div className="text-xs text-[var(--muted)]">vence dia {contract.dueDay} · {contract.status}</div>
                      </div>
                      <div className="text-sm font-semibold">{centsToCurrency(contract.monthlyFeeCents)}</div>
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

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
