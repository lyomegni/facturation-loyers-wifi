import Link from "next/link";
import { getContext } from "@/lib/context";
import { EmptyState, PageHeader, Stat, StatusPill, formatDate } from "@/components/ui";
import { formatXaf } from "@/lib/domain/money";
import { displayStatus, remaining } from "@/lib/domain/invoicing";
import { periodLabel, periodOf, todayIso } from "@/lib/domain/dates";
import type { Invoice } from "@/lib/types";

export const metadata = { title: "Tableau de bord" };

type Row = Invoice & { customer: { id: string; name: string } | null; property: { name: string } | null };

export default async function Dashboard() {
  const ctx = await getContext();
  const today = todayIso();
  const period = periodOf(today);
  const [{ data: month }, { data: late }, { count: customers }, { data: paid }] = await Promise.all([
    ctx.supabase.from("invoices").select("amount_xaf, paid_xaf, status").eq("org_id", ctx.org.id).eq("period", period).neq("status", "annulee"),
    ctx.supabase
      .from("invoices")
      .select("*, customer:customers(id, name), property:properties(name)")
      .eq("org_id", ctx.org.id)
      .eq("status", "a_payer")
      .lt("due_on", today)
      .order("due_on")
      .limit(100),
    ctx.supabase.from("customers").select("*", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("archived", false),
    ctx.supabase.from("payments").select("amount_xaf").eq("org_id", ctx.org.id).gte("paid_on", period).lte("paid_on", today),
  ]);
  const m = (month ?? []) as Pick<Invoice, "amount_xaf" | "paid_xaf" | "status">[];
  const billed = m.reduce((s, i) => s + i.amount_xaf, 0);
  const lateRows = (late ?? []) as Row[];
  const lateTotal = lateRows.reduce((s, i) => s + remaining(i), 0);
  const collected = (paid ?? []).reduce((s, p) => s + (p.amount_xaf as number), 0);

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={`${ctx.org.name} · ${periodLabel(period)}`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Facturé en ${periodLabel(period)}`} value={formatXaf(billed)} />
        <Stat label="Encaissé ce mois" value={formatXaf(collected)} tone="ok" />
        <Stat label="Impayés en retard" value={formatXaf(lateTotal)} tone={lateTotal ? "risk" : undefined} />
        <Stat label="Clients actifs" value={customers ?? 0} />
      </div>
      <h2 className="h2 mb-3">Factures en retard</h2>
      {lateRows.length === 0 ? (
        (customers ?? 0) === 0 ? (
          <EmptyState title="Bienvenue" action={<Link href="/app/biens" className="btn-primary">Ajouter mes immeubles et zones Wi-Fi</Link>}>
            Commencez par vos immeubles et zones Wi-Fi, puis ajoutez vos clients (ou importez votre fichier Excel). Les factures
            seront émises automatiquement chaque mois.
          </EmptyState>
        ) : (
          <p className="text-sm text-slate-600">Aucune facture en retard.</p>
        )
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Client</th><th>Bien</th><th>Facture</th><th>Reste dû</th><th>Échéance</th><th></th></tr></thead>
            <tbody>
              {lateRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.customer ? <Link href={`/app/clients/${r.customer.id}`} className="font-medium hover:underline">{r.customer.name}</Link> : "—"}</td>
                  <td>{r.property?.name ?? "—"}</td>
                  <td><Link href={`/app/factures/${r.id}`} className="font-mono text-xs hover:underline">{r.number}</Link></td>
                  <td className="whitespace-nowrap text-risk">{formatXaf(remaining(r))}</td>
                  <td>{formatDate(r.due_on)}</td>
                  <td><StatusPill status={displayStatus(r, today)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
