import { describe, expect, it } from "vitest";
import { coversPeriod, displayStatus, dueDateFor, invoiceKey, invoicesToIssue, type ContractForBilling } from "./invoicing";

const base: ContractForBilling = {
  id: "c1", org_id: "o1", customer_id: "cu1", property_id: "p1", service: "loyer",
  label: "Loyer", unit: "Appt B2", amount_xaf: 75000, due_day: 5,
  start_on: "2026-01-01", end_on: null, active: true,
};

describe("invoicesToIssue", () => {
  it("émet la facture du mois suivant quand l'échéance est dans le délai", () => {
    const d = invoicesToIssue([base], new Set([invoiceKey("c1", "2026-11-01")]), "2026-11-28", 7);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ period: "2026-12-01", due_on: "2026-12-05", amount_xaf: 75000, label: "Loyer · Appt B2 · décembre 2026" });
  });

  it("n'émet rien trop tôt", () => {
    const d = invoicesToIssue([base], new Set([invoiceKey("c1", "2026-11-01")]), "2026-11-20", 7);
    expect(d).toHaveLength(0);
  });

  it("émet la facture du mois en cours même si l'échéance est passée", () => {
    const d = invoicesToIssue([base], new Set(), "2026-11-20", 7);
    expect(d.map((x) => x.period)).toEqual(["2026-11-01"]);
  });

  it("ne refait pas une facture existante et ignore les contrats inactifs", () => {
    const existing = new Set([invoiceKey("c1", "2026-11-01")]);
    expect(invoicesToIssue([base], existing, "2026-11-10", 7)).toHaveLength(0);
    expect(invoicesToIssue([{ ...base, active: false }], new Set(), "2026-11-10", 7)).toHaveLength(0);
  });

  it("respecte les dates de début et de fin", () => {
    expect(invoicesToIssue([{ ...base, start_on: "2026-12-15" }], new Set(), "2026-11-28", 7).map((x) => x.period)).toEqual(["2026-12-01"]);
    expect(invoicesToIssue([{ ...base, end_on: "2026-11-30" }], new Set(), "2026-11-28", 7).map((x) => x.period)).toEqual(["2026-11-01"]);
  });

  it("délai zéro : facture le jour de l'échéance", () => {
    expect(invoicesToIssue([base], new Set(), "2026-11-04", 0)).toHaveLength(0);
    expect(invoicesToIssue([base], new Set(), "2026-11-05", 0)).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("dueDateFor", () => expect(dueDateFor("2026-02-01", 28)).toBe("2026-02-28"));
  it("coversPeriod", () => {
    expect(coversPeriod({ start_on: "2026-11-30", end_on: null }, "2026-11-01")).toBe(true);
    expect(coversPeriod({ start_on: "2026-12-01", end_on: null }, "2026-11-01")).toBe(false);
  });
  it("displayStatus", () => {
    expect(displayStatus({ status: "a_payer", due_on: "2026-11-05", paid_xaf: 0 }, "2026-11-06")).toBe("en_retard");
    expect(displayStatus({ status: "a_payer", due_on: "2026-11-05", paid_xaf: 10 }, "2026-11-01")).toBe("partielle");
    expect(displayStatus({ status: "payee", due_on: "2026-11-05", paid_xaf: 10 }, "2026-12-01")).toBe("payee");
  });
});
