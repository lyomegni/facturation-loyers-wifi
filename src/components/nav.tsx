"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app", label: "Tableau de bord" },
  { href: "/app/factures", label: "Factures" },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/biens", label: "Immeubles et zones Wi-Fi" },
  { href: "/app/import", label: "Import Excel" },
];

const ADMIN_LINKS = [{ href: "/app/parametres", label: "Paramètres" }];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const links = isAdmin ? [...LINKS, ...ADMIN_LINKS] : LINKS;
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto md:flex-col">
      {links.map((l) => {
        const active = l.href === "/app" ? path === "/app" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-sm ${
              active ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
