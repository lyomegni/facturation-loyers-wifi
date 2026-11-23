import QRCode from "qrcode";
import { appUrl } from "@/lib/env";

/** Adresse publique de vérification d'une facture (cible du code QR). */
export function invoicePublicUrl(token: string): string {
  return `${appUrl()}/f/${token}`;
}

/** Code QR en SVG, à insérer tel quel dans la page. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#13222b", light: "#ffffff" } });
}
