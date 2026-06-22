"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/financeiro", label: "Visão geral" },
  { href: "/financeiro/operacao", label: "Operação" },
  { href: "/financeiro/contratos", label: "Contratos" },
  { href: "/financeiro/recebiveis", label: "Recebíveis" },
  { href: "/financeiro/avulsos", label: "Avulsos" },
  { href: "/financeiro/banco", label: "Banco" },
  { href: "/financeiro/relatorios", label: "Relatórios" },
  { href: "/financeiro/alertas", label: "Alertas" },
];

export default function FinanceiroNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-2">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "block rounded-2xl border px-4 py-3 text-sm font-medium transition",
              active
                ? "border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--foreground)]"
                : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--foreground)] hover:bg-[var(--surface-2)]",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
