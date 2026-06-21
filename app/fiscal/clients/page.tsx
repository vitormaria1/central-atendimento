import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FiscalClientsPage() {
  return (
    <section className="max-w-3xl space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Clientes</div>
      <h2 className="text-3xl font-semibold tracking-tight">Cadastro fiscal completo no módulo de clientes.</h2>
      <p className="text-sm text-[var(--muted)]">
        O cadastro, incluindo os campos fiscais, fica no módulo de clientes. Abra a área própria para editar documentos, regime tributário, município fiscal e e-mail de emissão.
      </p>
      <Link href="/clients" className="inline-flex rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white">
        Abrir clientes
      </Link>
    </section>
  );
}
