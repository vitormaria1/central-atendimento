const alerts = [
  "Clientes com contrato ativo sem cobrança configurada.",
  "Lançamentos em aberto sem baixa após o vencimento.",
  "Serviços avulsos sem vínculo com a competência atual.",
  "Ciclos pendentes aguardando processamento.",
];

export const dynamic = "force-dynamic";

export default function FinanceiroAlertasPage() {
  return (
    <section className="space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Alertas</div>
      <h2 className="text-3xl font-semibold tracking-tight">Pontos de atenção da operação.</h2>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <div key={alert} className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            {alert}
          </div>
        ))}
      </div>
    </section>
  );
}
