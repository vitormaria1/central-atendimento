"use client";

import { useEffect, useMemo, useState } from "react";

type Service = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  municipalCode: string | null;
  cnae: string | null;
  taxRegime: string | null;
  updatedAt: string;
};

type ServiceForm = {
  id: string | null;
  code: string;
  name: string;
  description: string;
  municipalCode: string;
  cnae: string;
  taxRegime: string;
  active: boolean;
};

const emptyService: ServiceForm = {
  id: null,
  code: "",
  name: "",
  description: "",
  municipalCode: "",
  cnae: "",
  taxRegime: "",
  active: true,
};

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 text-sm outline-none"
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function Tag({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" }) {
  const classes =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700"
        : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes}`}>{label}</span>;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR");
}

export default function FiscalServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<ServiceForm>(emptyService);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);

  async function loadServices() {
    setLoading(true);
    try {
      const res = await fetch("/api/fiscal/services", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { items: Service[] };
        setServices(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadServices();
  }, []);

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services],
  );

  useEffect(() => {
    if (!selectedService) return;
    setForm({
      id: selectedService.id,
      code: selectedService.code,
      name: selectedService.name,
      description: selectedService.description ?? "",
      municipalCode: selectedService.municipalCode ?? "",
      cnae: selectedService.cnae ?? "",
      taxRegime: selectedService.taxRegime ?? "",
      active: selectedService.active,
    });
  }, [selectedService]);

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((service) => {
      const matchesActive = showActiveOnly ? service.active : true;
      const haystack = `${service.code} ${service.name} ${service.description ?? ""} ${service.taxRegime ?? ""} ${service.cnae ?? ""}`.toLowerCase();
      const matchesQuery = q ? haystack.includes(q) : true;
      return matchesActive && matchesQuery;
    });
  }, [query, services, showActiveOnly]);

  const activeCount = services.filter((service) => service.active).length;
  const inactiveCount = services.length - activeCount;
  const readyForInvoice = services.filter((service) => service.active && service.code && service.name).length;

  function resetForm() {
    setSelectedServiceId(null);
    setForm(emptyService);
    setToast(null);
  }

  async function saveService() {
    if (!form.code.trim() || !form.name.trim()) {
      setToast("Informe código e nome do serviço.");
      return;
    }
    setSaving(true);
    setToast(null);
    try {
      const payload = {
        id: form.id ? Number(form.id) : undefined,
        code: form.code,
        name: form.name,
        description: form.description || null,
        municipalCode: form.municipalCode || null,
        cnae: form.cnae || null,
        taxRegime: form.taxRegime || null,
        active: form.active,
        focusPayload: {},
      };

      const res = await fetch("/api/fiscal/services", {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(form.id ? "Falha ao atualizar serviço" : "Falha ao salvar serviço");
      setToast(form.id ? "Serviço atualizado." : "Serviço salvo.");
      resetForm();
      await loadServices();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao salvar serviço");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Serviços</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Catálogo fiscal</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Define o que pode ser usado na emissão e como o sistema deve operar.</p>
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]"
        >
          Novo serviço
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Serviços ativos" value={`${activeCount}`} />
        <Stat label="Inativos" value={`${inactiveCount}`} />
        <Stat label="Prontos para NF" value={`${readyForInvoice}`} />
        <Stat label="Total cadastrados" value={`${services.length}`} />
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando serviços...</div> : null}
      {toast ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{toast}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código, nome, CNAE ou regime"
              className="min-w-[240px] flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setShowActiveOnly((prev) => !prev)}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              {showActiveOnly ? "Mostrar todos" : "Mostrar ativos"}
            </button>
          </div>

          {filteredServices.map((service) => {
            const active = service.id === selectedServiceId;
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => setSelectedServiceId(service.id)}
                className={[
                  "w-full rounded-[28px] border p-5 text-left shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition",
                  active
                    ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]"
                    : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--surface-1)]",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{service.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {service.code} • {service.active ? "ativo" : "inativo"}
                    </div>
                  </div>
                  <Tag label={service.taxRegime || "sem regime"} tone={service.active ? "success" : "warning"} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[var(--muted)] md:grid-cols-2 xl:grid-cols-3">
                  <div>Município: {service.municipalCode || "—"}</div>
                  <div>CNAE: {service.cnae || "—"}</div>
                  <div>Atualizado: {formatDate(service.updatedAt)}</div>
                </div>
                {service.description ? <div className="mt-3 text-sm text-[var(--muted)]">{service.description}</div> : null}
              </button>
            );
          })}
        </div>

        <section className="space-y-4">
          <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              {form.id ? "Editar serviço" : "Novo serviço"}
            </div>
            <div className="mt-1 text-xl font-semibold">{selectedService?.name ?? "Catálogo fiscal"}</div>
            <div className="mt-4 grid gap-3">
              <Field label="Código" value={form.code} onChange={(v) => setForm((prev) => ({ ...prev, code: v }))} />
              <Field label="Nome" value={form.name} onChange={(v) => setForm((prev) => ({ ...prev, name: v }))} />
              <Field label="Código municipal" value={form.municipalCode} onChange={(v) => setForm((prev) => ({ ...prev, municipalCode: v }))} />
              <Field label="CNAE" value={form.cnae} onChange={(v) => setForm((prev) => ({ ...prev, cnae: v }))} />
              <Field label="Regime tributário" value={form.taxRegime} onChange={(v) => setForm((prev) => ({ ...prev, taxRegime: v }))} />
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição do serviço"
                className="min-h-[92px] rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm"
              />
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
                <span className="text-sm font-medium">Ativo</span>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} className="h-4 w-4" />
              </label>
              <button
                type="button"
                onClick={() => void saveService()}
                disabled={saving}
                className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? (form.id ? "Atualizando..." : "Salvando...") : form.id ? "Atualizar serviço" : "Salvar serviço"}
              </button>
            </div>
          </div>

          {selectedService ? (
            <div className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Leitura rápida</div>
              <div className="mt-1 text-xl font-semibold">Pronto para emissão</div>
              <div className="mt-4 grid gap-3">
                <InfoRow label="Código" value={selectedService.code} />
                <InfoRow label="Município" value={selectedService.municipalCode || "—"} />
                <InfoRow label="CNAE" value={selectedService.cnae || "—"} />
                <InfoRow label="Regime" value={selectedService.taxRegime || "—"} />
                <InfoRow label="Status" value={selectedService.active ? "Ativo" : "Inativo"} />
              </div>
            </div>
          ) : null}
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
