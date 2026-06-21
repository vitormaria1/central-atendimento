"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/fiscal", label: "Visão geral" },
  { href: "/fiscal/invoice", label: "Emissão de nota" },
  { href: "/fiscal/services", label: "Serviços" },
  { href: "/fiscal/alerts", label: "Alertas" },
  { href: "/fiscal/cycles", label: "Ciclos" },
  { href: "/fiscal/clients", label: "Clientes" },
  { href: "/fiscal/financeiro", label: "Financeiro" },
];

export default function FiscalNav() {
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
