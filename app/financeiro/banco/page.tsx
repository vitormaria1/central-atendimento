export const dynamic = "force-dynamic";

export default function FinanceiroBancoPage() {
  return (
    <section className="space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Banco</div>
      <h2 className="text-3xl font-semibold tracking-tight">Conciliação e saldo bancário.</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Conta corrente" text="Cadastrar contas, saldo inicial e status de integração." />
        <Card title="Conciliação" text="Associar extrato, identificar divergências e ajustar baixas." />
        <Card title="Cobranças" text="Pix, boleto e retorno bancário em linha do tempo única." />
        <Card title="Pagamentos" text="Contas a pagar, tributos e liquidação com rastreio." />
      </div>
    </section>
  );
}

function Card({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="text-lg font-semibold">{title}</div>
      <div className="mt-2 text-sm text-[var(--muted)]">{text}</div>
    </div>
  );
}
