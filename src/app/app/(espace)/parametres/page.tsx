import { whatsappConfigured } from "@/lib/whatsapp";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { updateOrganization } from "@/app/app/actions/org";

export const metadata = { title: "Paramètres" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ erreur?: string; ok?: string }> }) {
  const { erreur, ok } = await searchParams;
  const ctx = await getContext();
  if (!ctx.isAdmin) redirect("/app");
  const o = ctx.org;
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Ces informations apparaissent en tête de vos factures." />
      <Flash erreur={erreur} ok={ok} />
      <form action={updateOrganization} className="card grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field label="Nom affiché" name="name"><input id="name" name="name" required className="input" defaultValue={o.name} /></Field>
        <Field label="Téléphone" name="phone"><input id="phone" name="phone" className="input" defaultValue={o.phone ?? ""} /></Field>
        <Field label="Adresse" name="address"><input id="address" name="address" className="input" defaultValue={o.address ?? ""} /></Field>
        <Field label="E-mail" name="email"><input id="email" name="email" type="email" className="input" defaultValue={o.email ?? ""} /></Field>
        <Field label="NIU (facultatif)" name="tax_id"><input id="tax_id" name="tax_id" className="input" defaultValue={o.tax_id ?? ""} /></Field>
        <Field label="Préfixe des numéros" name="invoice_prefix" hint="Ex. FAC → FAC-2026-0001">
          <input id="invoice_prefix" name="invoice_prefix" className="input uppercase" defaultValue={o.invoice_prefix} maxLength={8} />
        </Field>
        <Field label="Émettre la facture (jours avant l'échéance)" name="invoice_lead_days" hint="0 = le jour de l'échéance. 7 par défaut.">
          <input id="invoice_lead_days" name="invoice_lead_days" type="number" min={0} max={28} className="input" defaultValue={o.invoice_lead_days} />
        </Field>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="whatsapp_enabled" defaultChecked={o.whatsapp_enabled} /> Envoyer les factures, rappels et reçus sur WhatsApp
          </label>
          <p className="text-xs text-slate-500">
            {whatsappConfigured()
              ? "Activez-le une fois vos modèles de messages validés par Meta."
              : "WhatsApp n'est pas encore configuré (variables WHATSAPP_… manquantes) : aucun message ne partira."}
          </p>
        </div>
        <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
      </form>
    </>
  );
}
