/**
 * Normalise un numéro camerounais au format international WhatsApp : +2376XXXXXXXX.
 * Accepte « 699 00 00 00 », « +237 699000000 », « 00237699000000 », « 237699000000 ».
 * Un numéro déjà international d'un autre pays (+33…, +241…) est conservé tel quel.
 * Renvoie null si le numéro est vide, « invalid » s'il est inexploitable.
 */
export function normalizePhone(input: unknown): string | null | "invalid" {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (raw === "") return null;
  let digits = raw.replace(/[\s.\-()/]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (digits.startsWith("+")) {
    if (!/^\+\d{8,15}$/.test(digits)) return "invalid";
    if (digits.startsWith("+237")) return validCameroon(digits.slice(4));
    return digits;
  }
  if (!/^\d+$/.test(digits)) return "invalid";
  if (digits.length === 12 && digits.startsWith("237")) return validCameroon(digits.slice(3));
  return validCameroon(digits);
}

function validCameroon(national: string): string | "invalid" {
  // 9 chiffres : 6XXXXXXXX (mobile) ou 2XXXXXXXX (fixe)
  return /^[62]\d{8}$/.test(national) ? `+237${national}` : "invalid";
}

/** +237699000000 → « +237 6 99 00 00 00 » */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const m = phone.match(/^\+237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `+237 ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : phone;
}

/** « Jean-Paul Mballa Nkodo » → « Jean-Paul M. N. » : nom partiellement masqué pour la page publique. */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return [parts[0], ...parts.slice(1).map((p) => `${p[0].toUpperCase()}.`)].join(" ");
}
