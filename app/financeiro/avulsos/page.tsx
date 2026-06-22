import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FinanceiroAvulsosPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Avulsos</div>
      <h2 className="text-3xl font-semibold tracking-tight">Lançamentos extraordinários do mês.</h2>
      <p className="text-sm text-[var(--muted)]">
        Despesas ou serviços fora do contrato entram aqui e são incorporados na competência.
      </p>
      <Link href="/financeiro/operacao" className="inline-flex rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
        Abrir avulsos
      </Link>
    </section>
  );
}
