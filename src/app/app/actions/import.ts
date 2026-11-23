"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCanEdit, getContext } from "@/lib/context";
import { normalize } from "@/lib/domain/import";
import { SERVICE_LABELS } from "@/lib/domain/invoicing";
import { todayIso } from "@/lib/domain/dates";

const rowSchema = z.object({
  line: z.number().int(),
  name: z.string().min(1).max(200),
  phone: z.string().regex(/^\+\d{8,15}$/).nullable(),
  email: z.string().max(200).nullable(),
  propertyName: z.string().max(200).nullable(),
  service: z.enum(["loyer", "wifi", "autre"]),
  unit: z.string().max(200).nullable(),
  amount: z.number().int().positive().nullable(),
  dueDay: z.number().int().min(1).max(28),
  startOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export type ImportOutcome =
  | { ok: true; customers: number; contracts: number; properties: number }
  | { ok: false; error: string };

export async function importCustomers(input: { rows: unknown[]; defaultPropertyId: string }): Promise<ImportOutcome> {
  const ctx = await getContext();
  try {
    assertCanEdit(ctx);
    const rows = z.array(rowSchema).max(2000).parse(input.rows);
    if (rows.length === 0) return { ok: false, error: "Aucune ligne à importer." };
    const db = ctx.supabase;
    const orgId = ctx.org.id;

    // Biens : ceux du fichier qui n'existent pas encore sont créés.
    const { data: props, error: pe } = await db.from("properties").select("id, name").eq("org_id", orgId);
    if (pe) throw new Error(pe.message);
    const propByName = new Map((props ?? []).map((p) => [normalize(p.name), p.id as string]));
    const missing = new Map<string, { name: string; kind: string }>();
    for (const r of rows) {
      if (r.propertyName && !propByName.has(normalize(r.propertyName))) {
        missing.set(normalize(r.propertyName), { name: r.propertyName, kind: r.service === "wifi" ? "zone_wifi" : "immeuble" });
      }
    }
    if (missing.size) {
      const { data, error } = await db
        .from("properties")
        .insert([...missing.values()].map((m) => ({ org_id: orgId, ...m })))
        .select("id, name");
      if (error) throw new Error(error.message);
      data.forEach((p) => propByName.set(normalize(p.name), p.id));
    }

    // Clients : regroupés par téléphone, sinon par nom. Les clients existants sont réutilisés.
    const { data: existing, error: ce } = await db.from("customers").select("id, name, phone").eq("org_id", orgId);
    if (ce) throw new Error(ce.message);
    const byPhone = new Map((existing ?? []).filter((c) => c.phone).map((c) => [c.phone as string, c.id as string]));
    const byName = new Map((existing ?? []).map((c) => [normalize(c.name), c.id as string]));
    const keyOf = (r: (typeof rows)[number]) => r.phone ?? `nom:${normalize(r.name)}`;
    const toCreate = new Map<string, { name: string; phone: string | null; email: string | null }>();
    for (const r of rows) {
      const known = (r.phone && byPhone.get(r.phone)) || (!r.phone && byName.get(normalize(r.name)));
      if (!known && !toCreate.has(keyOf(r))) toCreate.set(keyOf(r), { name: r.name, phone: r.phone, email: r.email });
    }
    const customerId = new Map<string, string>();
    if (toCreate.size) {
      const { data, error } = await db
        .from("customers")
        .insert([...toCreate.values()].map((c) => ({ org_id: orgId, ...c })))
        .select("id, name, phone");
      if (error) throw new Error(error.message);
      data.forEach((c) => customerId.set(c.phone ?? `nom:${normalize(c.name)}`, c.id));
    }
    const resolveCustomer = (r: (typeof rows)[number]) =>
      customerId.get(keyOf(r)) ?? (r.phone ? byPhone.get(r.phone) : byName.get(normalize(r.name)));

    // Contrats : une ligne avec un montant = un contrat.
    const today = todayIso();
    const contracts = rows
      .filter((r) => r.amount)
      .map((r) => {
        const propertyId = (r.propertyName && propByName.get(normalize(r.propertyName))) || input.defaultPropertyId;
        if (!propertyId) throw new Error(`Ligne ${r.line} : aucun immeuble ou zone pour ${r.name}. Choisissez un bien par défaut.`);
        const cid = resolveCustomer(r);
        if (!cid) throw new Error(`Ligne ${r.line} : client introuvable.`);
        return {
          org_id: orgId,
          customer_id: cid,
          property_id: propertyId,
          service: r.service,
          label: SERVICE_LABELS[r.service],
          unit: r.unit,
          amount_xaf: r.amount!,
          due_day: r.dueDay,
          start_on: r.startOn ?? `${today.slice(0, 7)}-01`,
        };
      });
    if (contracts.length) {
      const { error } = await db.from("contracts").insert(contracts);
      if (error) throw new Error(error.message);
    }

    revalidatePath("/app", "layout");
    return { ok: true, customers: toCreate.size, contracts: contracts.length, properties: missing.size };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue" };
  }
}
