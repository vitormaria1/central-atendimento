export const dynamic = "force-dynamic";

const reports = [
  "Fluxo de caixa",
  "Previsto x realizado",
  "DRE gerencial",
  "Inadimplência por faixa",
  "Contratos ativos vs pausados",
  "Serviços avulsos por cliente",
];

export default function FinanceiroRelatoriosPage() {
  return (
    <section className="space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Relatórios</div>
      <h2 className="text-3xl font-semibold tracking-tight">Visão gerencial do escritório.</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {reports.map((report) => (
          <div key={report} className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="font-semibold">{report}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
