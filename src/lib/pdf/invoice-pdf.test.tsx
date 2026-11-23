import { describe, expect, it } from "vitest";
import { pdfText, renderInvoicePdf, stampText, type InvoicePdfData } from "./invoice-pdf";

const base: InvoicePdfData = {
  org: { name: "Résidences Test", address: "Douala", phone: "+237 6 99 00 00 00", email: null, tax_id: null },
  invoice: { number: "FAC-2026-0001", label: "Loyer · B2 · novembre 2026", amount_xaf: 75000, paid_xaf: 75000, status: "payee", issued_on: "2026-11-01", due_on: "2026-11-05", paid_at: "2026-11-04" },
  customer: { name: "Jean Mballa", phone: "+237699000000" },
  propertyName: "Immeuble Bonamoussadi",
  publicUrl: "https://app.test/f/abc",
  qrDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
};

describe("stampText", () => {
  it("ACQUITTÉE avec la date pour une facture payée", () => expect(stampText(base.invoice)).toBe("ACQUITTÉE le 04/11/2026"));
  it("rien pour une facture à payer", () => expect(stampText({ ...base.invoice, status: "a_payer", paid_xaf: 0, paid_at: null })).toBeNull());
  it("ANNULÉE pour une facture annulée", () => expect(stampText({ ...base.invoice, status: "annulee", paid_xaf: 0, paid_at: null })).toBe("ANNULÉE"));
});

describe("pdfText", () => {
  it("remplace l'espace fine (absente d'Helvetica) par une espace normale", () => expect(pdfText("75 000 FCFA")).toBe("75 000 FCFA"));
});

describe("renderInvoicePdf", () => {
  it("produit un PDF", async () => {
    const buf = await renderInvoicePdf(base);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(1000);
  }, 20000);
});
