import { parseFrenchDate } from "./dates";
import { parseXaf } from "./money";
import { normalizePhone } from "./phone";
import type { Service } from "./invoicing";

export type ImportedRow = {
  line: number;
  name: string;
  phone: string | null;
  email: string | null;
  propertyName: string | null;
  service: Service;
  unit: string | null;
  amount: number | null;
  dueDay: number;
  startOn: string | null;
};

export type ImportResult = {
  rows: ImportedRow[];
  errors: { line: number; message: string }[];
};

type Field = "name" | "phone" | "email" | "property" | "service" | "unit" | "amount" | "dueDay" | "startOn";

const HEADER_ALIASES: Record<Field, string[]> = {
  name: ["nom", "client", "locataire", "abonne", "nom complet", "nom et prenom", "noms"],
  phone: ["telephone", "tel", "whatsapp", "numero", "contact", "portable", "mobile"],
  email: ["email", "e mail", "mail", "courriel"],
  property: ["immeuble", "bien", "zone", "zone wifi", "batiment", "site", "residence"],
  service: ["service", "type", "nature", "objet"],
  unit: ["logement", "appartement", "appt", "porte", "chambre", "studio", "boutique", "local", "point d acces"],
  amount: ["montant", "loyer", "prix", "redevance", "mensualite", "tarif"],
  dueDay: ["jour", "echeance", "jour d echeance", "jour de paiement", "jour echeance"],
  startOn: ["debut", "date de debut", "date d entree", "entree", "depuis", "date debut"],
};

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mapHeaders(header: unknown[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((cell, index) => {
    const h = normalize(String(cell ?? ""));
    if (!h) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
      if (map[field] !== undefined) continue;
      if (aliases.some((a) => h === a || h.startsWith(a + " ") || h.endsWith(" " + a))) {
        map[field] = index;
        return;
      }
    }
  });
  return map;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function parseService(value: unknown, hint?: string | null): Service {
  const s = normalize(String(value ?? "") + " " + (hint ?? ""));
  if (/wifi|wi fi|internet|connexion|redevance/.test(s)) return "wifi";
  if (/loyer|location|appartement|studio|chambre|boutique|immeuble/.test(s)) return "loyer";
  return value ? "autre" : "loyer";
}

/** Transforme un tableau (1re ligne = en-têtes) en clients et contrats à créer. */
export function parseCustomerSheet(table: unknown[][]): ImportResult {
  const headerIndex = table.findIndex((r) => r.some((c) => text(c)));
  if (headerIndex < 0) return { rows: [], errors: [{ line: 1, message: "Fichier vide." }] };
  const map = mapHeaders(table[headerIndex]);
  if (map.name === undefined) {
    return { rows: [], errors: [{ line: headerIndex + 1, message: "Colonne « Nom » introuvable dans la première ligne." }] };
  }
  const rows: ImportedRow[] = [];
  const errors: ImportResult["errors"] = [];
  const get = (r: unknown[], f: Field) => (map[f] === undefined ? null : r[map[f]!]);

  table.slice(headerIndex + 1).forEach((r, i) => {
    const line = headerIndex + i + 2;
    if (!r.some((c) => text(c))) return;
    const name = text(get(r, "name"));
    if (!name) {
      errors.push({ line, message: "Nom manquant." });
      return;
    }
    const phone = normalizePhone(get(r, "phone"));
    if (phone === "invalid") {
      errors.push({ line, message: `Numéro de téléphone invalide pour ${name}.` });
      return;
    }
    const rawAmount = get(r, "amount");
    const amount = text(rawAmount) === null ? null : parseXaf(rawAmount);
    if (text(rawAmount) !== null && amount === null) {
      errors.push({ line, message: `Montant invalide pour ${name}.` });
      return;
    }
    const rawDay = text(get(r, "dueDay"));
    let dueDay = 5;
    if (rawDay) {
      const d = Number(rawDay.replace(/\D/g, ""));
      if (!Number.isInteger(d) || d < 1 || d > 31) {
        errors.push({ line, message: `Jour d'échéance invalide pour ${name} (1 à 28).` });
        return;
      }
      dueDay = Math.min(d, 28);
    }
    const startOn = parseFrenchDate(get(r, "startOn"));
    if (startOn === "invalid") {
      errors.push({ line, message: `Date de début invalide pour ${name} (JJ/MM/AAAA).` });
      return;
    }
    const propertyName = text(get(r, "property"));
    rows.push({
      line,
      name,
      phone,
      email: text(get(r, "email")),
      propertyName,
      service: parseService(get(r, "service"), map.service === undefined ? propertyName : null),
      unit: text(get(r, "unit")),
      amount,
      dueDay,
      startOn,
    });
  });
  return { rows, errors };
}
