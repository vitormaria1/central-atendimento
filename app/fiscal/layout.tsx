import FiscalNav from "./fiscal-nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FiscalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] gap-6 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[32px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] xl:sticky xl:top-6 xl:self-start">
          <Link
            href="/"
            className="inline-flex items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)]"
          >
            Voltar
          </Link>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Fiscal</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Central de Inteligência</h1>
          <div className="mt-6">
            <FiscalNav />
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
