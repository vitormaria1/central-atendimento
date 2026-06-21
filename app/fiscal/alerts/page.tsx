export const dynamic = "force-dynamic";

const items = [
  "Validar cadastro fiscal do cliente antes de emitir NFS.",
  "Conferir contrato ativo, honorário e configuração de envio.",
  "Acompanhar retorno da nota, boleto e status de pagamento.",
];

export default function FiscalAlertsPage() {
  return (
    <section className="space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Alertas</div>
      <h2 className="text-3xl font-semibold tracking-tight">Pontos de atenção da operação.</h2>
      <ul className="space-y-2 text-sm text-[var(--muted)]">
        {items.map((item) => (
          <li key={item} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
