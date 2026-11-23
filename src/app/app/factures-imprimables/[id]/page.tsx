import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { formatXaf } from "@/lib/domain/money";
import { formatDate, todayIso } from "@/lib/domain/dates";
import { formatPhone } from "@/lib/domain/phone";
import { displayStatus, remaining, STATUS_LABELS } from "@/lib/domain/invoicing";
import { invoicePublicUrl, qrSvg } from "@/lib/qr";
import { PrintButton } from "@/components/print-button";
import type { Invoice } from "@/lib/types";

export const metadata = { title: "Facture" };

/** Facture au format A4, à imprimer ou à enregistrer en PDF depuis le navigateur. */
export default async function PrintableInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getContext();
  const { data } = await ctx.supabase
    .from("invoices")
    .select("*, customer:customers(name, phone, email), property:properties(name, address)")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice & {
    customer: { name: string; phone: string | null; email: string | null };
    property: { name: string; address: string | null } | null;
  };
  const url = invoicePublicUrl(inv.public_token);
  const svg = await qrSvg(url);
  const o = ctx.org;
  const status = displayStatus(inv, todayIso());

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-between px-4 print:hidden">
        <Link href={`/app/factures/${inv.id}`} className="text-sm text-slate-600">← Retour</Link>
        <PrintButton />
      </div>
      <article className="mx-auto flex min-h-[297mm] max-w-[210mm] flex-col gap-8 bg-white p-[15mm] text-sm shadow print:shadow-none">
        <header className="flex justify-between gap-6">
          <div>
            <p className="font-display text-2xl font-bold">{o.name}</p>
            {o.address && <p>{o.address}</p>}
            {o.phone && <p>{o.phone}</p>}
            {o.email && <p>{o.email}</p>}
            {o.tax_id && <p>NIU : {o.tax_id}</p>}
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-semibold uppercase">Facture</p>
            <p className="font-mono">{inv.number}</p>
            <p>Émise le {formatDate(inv.issued_on)}</p>
            <p>Échéance : {formatDate(inv.due_on)}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6">
          <div>
            <p className="label">Facturé à</p>
            <p className="font-medium">{inv.customer.name}</p>
            {inv.customer.phone && <p>{formatPhone(inv.customer.phone)}</p>}
            {inv.customer.email && <p>{inv.customer.email}</p>}
          </div>
          {inv.property && (
            <div>
              <p className="label">Bien</p>
              <p className="font-medium">{inv.property.name}</p>
              {inv.property.address && <p>{inv.property.address}</p>}
            </div>
          )}
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-ink text-left">
              <th className="py-2">Désignation</th>
              <th className="py-2 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-3">{inv.label}</td>
              <td className="py-3 text-right">{formatXaf(inv.amount_xaf)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><td className="pt-3 text-right font-medium">Total</td><td className="pt-3 text-right font-semibold">{formatXaf(inv.amount_xaf)}</td></tr>
            <tr><td className="text-right">Déjà payé</td><td className="text-right">{formatXaf(inv.paid_xaf)}</td></tr>
            <tr><td className="text-right font-medium">Reste à payer</td><td className="text-right font-semibold">{formatXaf(remaining(inv))}</td></tr>
          </tfoot>
        </table>

        <p className="text-center font-display text-xl font-semibold uppercase tracking-wide">
          {status === "payee" ? `Payée${inv.paid_at ? ` le ${formatDate(inv.paid_at)}` : ""}` : STATUS_LABELS[status]}
        </p>

        <footer className="mt-auto flex items-end justify-between gap-6 border-t border-slate-200 pt-4">
          <p className="max-w-[110mm] text-xs text-slate-600">
            Scannez ce code pour vérifier l&apos;authenticité de cette facture et son état de paiement en ligne :<br />
            <span className="break-all font-mono">{url}</span>
          </p>
          <div className="h-[30mm] w-[30mm] shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        </footer>
      </article>
    </div>
  );
}
