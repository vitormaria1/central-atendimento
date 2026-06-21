"use client";

import { useEffect, useState } from "react";

type Service = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  municipalCode: string | null;
  cnae: string | null;
  taxRegime: string | null;
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

export default function FiscalServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState(emptyService);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function saveService() {
    if (!form.code.trim() || !form.name.trim()) {
      setToast("Informe código e nome do serviço.");
      return;
    }
    setSaving(true);
    setToast(null);
    try {
      const res = await fetch("/api/fiscal/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          description: form.description || null,
          municipalCode: form.municipalCode || null,
          cnae: form.cnae || null,
          taxRegime: form.taxRegime || null,
          active: form.active,
          focusPayload: {},
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar serviço");
      setToast("Serviço salvo.");
      setForm(emptyService);
      await loadServices();
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Falha ao salvar serviço");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Serviços</div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Catálogo fiscal.</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Cadastro e manutenção dos serviços que podem ser usados na emissão.</p>
      </div>

      {loading ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--muted)]">Carregando serviços...</div> : null}
      {toast ? <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm">{toast}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
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
              {service.description ? <div className="mt-2 text-sm text-[var(--muted)]">{service.description}</div> : null}
            </div>
          ))}
        </div>

        <section className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Novo serviço</div>
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
            <button
              type="button"
              onClick={() => void saveService()}
              disabled={saving}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar serviço"}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
