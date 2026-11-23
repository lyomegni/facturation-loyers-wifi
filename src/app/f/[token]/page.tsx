import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatXaf } from "@/lib/domain/money";
import { formatDate, todayIso } from "@/lib/domain/dates";
import { maskName } from "@/lib/domain/phone";
import { displayStatus, STATUS_LABELS, type StoredStatus } from "@/lib/domain/invoicing";

export const metadata = { title: "Vérification de facture", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type PublicInvoice = {
  number: string;
  label: string;
  amount_xaf: number;
  paid_xaf: number;
  status: StoredStatus;
  issued_on: string;
  due_on: string;
  paid_at: string | null;
  customer_name: string;
  property_name: string | null;
  org_name: string;
  org_phone: string | null;
  org_address: string | null;
};

/** Cible du code QR imprimé sur chaque facture : prouve que la facture existe et montre son état. */
export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_invoice", { token });
  const inv = (data as PublicInvoice[] | null)?.[0];
  if (!inv) notFound();
  const status = displayStatus(inv, todayIso());
  const tone =
    status === "payee" ? "border-ok bg-emerald-50 text-ok" : status === "annulee" ? "border-slate-400 bg-slate-50 text-slate-700" : status === "en_retard" ? "border-risk bg-red-50 text-risk" : "border-warn bg-amber-50 text-warn";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-10">
      <div className="flex items-center gap-2 text-sm text-ok">
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M10 1l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V4l7-3zm-1 12l6-6-1.4-1.4L9 10.2 6.4 7.6 5 9l4 4z" /></svg>
        Facture authentique, émise par {inv.org_name}
      </div>
      <div className="card flex flex-col gap-4">
        <div>
          <p className="label">Facture</p>
          <p className="font-mono text-lg font-semibold">{inv.number}</p>
          <p className="text-sm text-slate-600">{inv.label}</p>
        </div>
        <div className={`border-l-4 px-3 py-2 text-sm font-medium ${tone}`}>
          {STATUS_LABELS[status]}
          {status === "payee" && inv.paid_at && ` le ${formatDate(inv.paid_at)}`}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="label">Client</dt><dd>{maskName(inv.customer_name)}</dd></div>
          <div><dt className="label">Bien</dt><dd>{inv.property_name ?? "—"}</dd></div>
          <div><dt className="label">Montant</dt><dd className="font-semibold">{formatXaf(inv.amount_xaf)}</dd></div>
          <div><dt className="label">Déjà payé</dt><dd>{formatXaf(inv.paid_xaf)}</dd></div>
          <div><dt className="label">Émise le</dt><dd>{formatDate(inv.issued_on)}</dd></div>
          <div><dt className="label">Échéance</dt><dd>{formatDate(inv.due_on)}</dd></div>
        </dl>
      </div>
      <p className="text-xs text-slate-500">
        {inv.org_name}{inv.org_address ? ` · ${inv.org_address}` : ""}{inv.org_phone ? ` · ${inv.org_phone}` : ""}. Si les
        informations de votre document papier diffèrent de celles-ci, il ne s&apos;agit pas d&apos;une facture valide.
      </p>
    </main>
  );
}
