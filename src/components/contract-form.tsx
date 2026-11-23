import { Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { todayIso } from "@/lib/domain/dates";
import type { Contract, Property } from "@/lib/types";

/** Formulaire d'ajout ou de modification d'un contrat (loyer, Wi-Fi…). */
export function ContractForm({
  action,
  customerId,
  properties,
  contract,
}: {
  action: (form: FormData) => Promise<void>;
  customerId: string;
  properties: Property[];
  contract?: Contract;
}) {
  const p = contract ? `c-${contract.id}-` : "new-";
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="customer_id" value={customerId} />
      {contract && <input type="hidden" name="id" value={contract.id} />}
      <Field label="Immeuble ou zone Wi-Fi" name={`${p}property_id`}>
        <select id={`${p}property_id`} name="property_id" required className="input" defaultValue={contract?.property_id ?? ""}>
          <option value="" disabled>Choisir…</option>
          {properties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label="Service" name={`${p}service`}>
        <select id={`${p}service`} name="service" className="input" defaultValue={contract?.service ?? "loyer"}>
          <option value="loyer">Loyer</option>
          <option value="wifi">Redevance Wi-Fi</option>
          <option value="autre">Autre</option>
        </select>
      </Field>
      <Field label="Libellé sur la facture" name={`${p}label`}>
        <input id={`${p}label`} name="label" required className="input" defaultValue={contract?.label ?? "Loyer"} placeholder="Loyer, Wi-Fi illimité…" />
      </Field>
      <Field label="Logement / point d'accès" name={`${p}unit`}>
        <input id={`${p}unit`} name="unit" className="input" defaultValue={contract?.unit ?? ""} placeholder="Appt B2, Studio 3…" />
      </Field>
      <Field label="Montant mensuel (FCFA)" name={`${p}amount_xaf`}>
        <input id={`${p}amount_xaf`} name="amount_xaf" required inputMode="numeric" className="input" defaultValue={contract?.amount_xaf ?? ""} placeholder="75 000" />
      </Field>
      <Field label="Jour d'échéance (1 à 28)" name={`${p}due_day`}>
        <input id={`${p}due_day`} name="due_day" type="number" min={1} max={28} required className="input" defaultValue={contract?.due_day ?? 5} />
      </Field>
      <Field label="Début" name={`${p}start_on`}>
        <input id={`${p}start_on`} name="start_on" type="date" required className="input" defaultValue={contract?.start_on ?? `${todayIso().slice(0, 7)}-01`} />
      </Field>
      <Field label="Fin (facultatif)" name={`${p}end_on`}>
        <input id={`${p}end_on`} name="end_on" type="date" className="input" defaultValue={contract?.end_on ?? ""} />
      </Field>
      {contract && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={contract.active} /> Contrat actif (décocher pour arrêter la facturation)
        </label>
      )}
      <div className="sm:col-span-2"><SubmitButton>{contract ? "Enregistrer le contrat" : "Ajouter le contrat"}</SubmitButton></div>
    </form>
  );
}
