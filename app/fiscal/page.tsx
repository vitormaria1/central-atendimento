import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FiscalHomePage() {
  return (
    <section className="space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Central de Inteligência</div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Operação fiscal e financeira em telas separadas.</h2>
        <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">
          Use o menu lateral para abrir cada módulo. A página inicial fica enxuta para evitar blocos informativos e facilitar a navegação.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/fiscal/invoice" className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
          Emitir NFS
        </Link>
        <Link href="/fiscal/services" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
          Serviços
        </Link>
        <Link href="/fiscal/cycles" className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]">
          Ciclos
        </Link>
      </div>
    </section>
  );
}
