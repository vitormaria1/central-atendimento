import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FinanceiroContratosPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Contratos</div>
      <h2 className="text-3xl font-semibold tracking-tight">Base de cobrança por cliente.</h2>
      <p className="text-sm text-[var(--muted)]">
        Aqui ficam honorário mensal, vencimento, automações e regras de cobrança.
      </p>
      <Link href="/financeiro/operacao" className="inline-flex rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
        Abrir contratos
      </Link>
    </section>
  );
}
