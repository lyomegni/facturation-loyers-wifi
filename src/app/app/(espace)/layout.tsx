import Link from "next/link";
import { getContext } from "@/lib/context";
import { switchOrganization } from "@/app/app/actions/org";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-slate-200 bg-ink text-slate-100 md:min-h-screen md:border-b-0">
        <div className="flex flex-col gap-4 px-4 py-4">
          <Link href="/app" className="font-display text-2xl font-bold text-white">
            Paye<span className="text-brand-bright">Facile</span>
          </Link>
          {ctx.organizations.length > 1 ? (
            <form action={switchOrganization} className="flex gap-2">
              <label htmlFor="org" className="sr-only">Espace</label>
              <select id="org" name="org" defaultValue={ctx.org.id} className="input bg-white text-ink">
                {ctx.organizations.map((o) => (
                  <option key={o.org.id} value={o.org.id}>{o.org.name}</option>
                ))}
              </select>
              <button className="btn-secondary px-2" type="submit">OK</button>
            </form>
          ) : (
            <p className="text-sm text-slate-300">{ctx.org.name}</p>
          )}
          <Nav isAdmin={ctx.isAdmin} />
          <div className="flex flex-col gap-2 border-t border-white/10 pt-4 text-sm">
            <p className="truncate text-xs text-slate-400">{ctx.user.email}</p>
            <form action="/auth/deconnexion" method="post">
              <button type="submit" className="text-xs text-slate-300 underline">Se déconnecter</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
