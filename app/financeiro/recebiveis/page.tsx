import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FinanceiroRecebiveisPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Recebíveis</div>
      <h2 className="text-3xl font-semibold tracking-tight">Controle de contas a receber e baixas.</h2>
      <p className="text-sm text-[var(--muted)]">
        Área para acompanhar abertas, vencidas e liquidadas, com ação rápida de baixa.
      </p>
      <Link href="/financeiro/operacao" className="inline-flex rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
        Abrir recebíveis
      </Link>
    </section>
  );
}
