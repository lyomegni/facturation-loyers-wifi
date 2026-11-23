import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { BackLink, Field, Flash, PageHeader, StatusPill, formatDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deletePayment, recordPayment, setInvoiceCancelled } from "@/app/app/actions/invoices";
import { formatXaf } from "@/lib/domain/money";
import { formatPhone } from "@/lib/domain/phone";
import { displayStatus, remaining } from "@/lib/domain/invoicing";
import { todayIso } from "@/lib/domain/dates";
import { invoicePublicUrl, qrSvg } from "@/lib/qr";
import { PAYMENT_METHOD_LABELS, type Invoice, type Payment, type PaymentMethod } from "@/lib/types";

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erreur?: string; ok?: string }> }) {
  const { id } = await params;
  const { erreur, ok } = await searchParams;
  const ctx = await getContext();
  const { data } = await ctx.supabase
    .from("invoices")
    .select("*, customer:customers(id, name, phone), property:properties(name)")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!data) notFound();
  const inv = data as Invoice & { customer: { id: string; name: string; phone: string | null }; property: { name: string } | null };
  const { data: pays } = await ctx.supabase.from("payments").select("*").eq("invoice_id", id).order("paid_on");
  const payments = (pays ?? []) as Payment[];
  const today = todayIso();
  const left = remaining(inv);
  const publicUrl = invoicePublicUrl(inv.public_token);
  const svg = await qrSvg(publicUrl);

  return (
    <>
      <BackLink href="/app/factures">Factures</BackLink>
      <PageHeader title={`Facture ${inv.number}`} subtitle={inv.label} actions={<><StatusPill status={displayStatus(inv, today)} /><Link href={`/app/factures-imprimables/${inv.id}`} className="btn-secondary">Facture imprimable</Link><a href={`/api/factures/${inv.public_token}/pdf`} className="btn-secondary">PDF</a></>} />
      <Flash erreur={erreur} ok={ok} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <dl className="card grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="label">Client</dt><dd><Link href={`/app/clients/${inv.customer.id}`} className="font-medium hover:underline">{inv.customer.name}</Link></dd></div>
            <div><dt className="label">WhatsApp</dt><dd>{formatPhone(inv.customer.phone)}</dd></div>
            <div><dt className="label">Bien</dt><dd>{inv.property?.name ?? "—"}</dd></div>
            <div><dt className="label">Émise le</dt><dd>{formatDate(inv.issued_on)}</dd></div>
            <div><dt className="label">Montant</dt><dd className="font-display text-xl font-semibold">{formatXaf(inv.amount_xaf)}</dd></div>
            <div><dt className="label">Échéance</dt><dd>{formatDate(inv.due_on)}</dd></div>
            <div><dt className="label">Déjà payé</dt><dd>{formatXaf(inv.paid_xaf)}</dd></div>
            <div><dt className="label">Reste à payer</dt><dd className={left ? "font-semibold text-risk" : ""}>{formatXaf(left)}</dd></div>
          </dl>

          <section className="flex flex-col gap-3">
            <h2 className="h2">Paiements</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Moyen</th><th>Montant</th><th>Référence</th><th></th></tr></thead>
                <tbody>
                  {payments.length === 0 && <tr><td colSpan={5} className="text-slate-500">Aucun paiement enregistré.</td></tr>}
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.paid_on)}</td>
                      <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                      <td className="whitespace-nowrap">{formatXaf(p.amount_xaf)}</td>
                      <td className="font-mono text-xs">{p.reference ?? "—"}</td>
                      <td>
                        {ctx.isAdmin && (
                          <form action={deletePayment}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="invoice_id" value={inv.id} />
                            <button className="text-xs text-risk underline" type="submit">Supprimer</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card flex items-center gap-3">
            <div className="h-24 w-24 shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="min-w-0 text-xs text-slate-600">
              <p className="font-medium text-ink">Code QR d&apos;authenticité</p>
              <p>Imprimé sur la facture. Il ouvre la page de vérification :</p>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="break-all underline">{publicUrl}</a>
            </div>
          </div>
        {ctx.canEdit && (
          <>
            {inv.status !== "annulee" && left > 0 && (
              <form action={recordPayment} className="card flex flex-col gap-3">
                <h2 className="h2">Enregistrer un paiement</h2>
                <p className="text-xs text-slate-500">Pour un paiement reçu hors application (espèces, transfert direct). Les paiements par lien arriveront automatiquement à l&apos;étape 2.</p>
                <input type="hidden" name="invoice_id" value={inv.id} />
                <Field label="Montant (FCFA)" name="amount_xaf"><input id="amount_xaf" name="amount_xaf" required inputMode="numeric" className="input" defaultValue={left} /></Field>
                <Field label="Moyen" name="method">
                  <select id="method" name="method" className="input" defaultValue="orange_money">
                    {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                  </select>
                </Field>
                <Field label="Date" name="paid_on"><input id="paid_on" name="paid_on" type="date" className="input" defaultValue={today} /></Field>
                <Field label="Référence de transaction" name="reference"><input id="reference" name="reference" className="input" placeholder="Ex. ID de transaction MoMo" /></Field>
                <SubmitButton>Enregistrer</SubmitButton>
              </form>
            )}
            {inv.paid_xaf === 0 && (
              <form action={setInvoiceCancelled} className="card flex flex-col gap-2">
                <input type="hidden" name="id" value={inv.id} />
                <input type="hidden" name="cancel" value={inv.status === "annulee" ? "0" : "1"} />
                <button type="submit" className={inv.status === "annulee" ? "btn-secondary" : "btn-danger"}>
                  {inv.status === "annulee" ? "Rétablir la facture" : "Annuler la facture"}
                </button>
              </form>
            )}
          </>
        )}
        </div>
      </div>
    </>
  );
}
