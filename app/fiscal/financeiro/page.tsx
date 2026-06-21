import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FiscalFinanceiroPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Financeiro</div>
      <h2 className="text-3xl font-semibold tracking-tight">Contratos, cobranças e serviços avulsos.</h2>
      <p className="text-sm text-[var(--muted)]">
        A gestão de contratos, honorários mensais, boletos, status de pagamento e serviços avulsos fica no módulo financeiro.
      </p>
      <Link href="/financeiro" className="inline-flex rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
        Abrir financeiro
      </Link>
    </section>
  );
}
