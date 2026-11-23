/** 25000 → « 25 000 FCFA » (espace insécable fine entre les milliers). */
export function formatXaf(amount: number): string {
  const n = Math.round(amount);
  const digits = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "-" : ""}${digits} FCFA`;
}

/** « 25 000 », « 25.000 », « 25000 F », « 25 000 FCFA » → 25000. Renvoie null si invalide. */
export function parseXaf(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/f\s*cfa|xaf|fcfa|f$/i, "").replace(/[\s  .,]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? n : null;
}
