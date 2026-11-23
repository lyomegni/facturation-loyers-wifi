import { describe, expect, it } from "vitest";
import { payableAmount, splitName } from "./pay";

describe("payableAmount", () => {
  it("reste à payer d'une facture partiellement payée", () => expect(payableAmount({ status: "a_payer", amount_xaf: 75000, paid_xaf: 25000 })).toBe(50000));
  it("0 si payée", () => expect(payableAmount({ status: "payee", amount_xaf: 75000, paid_xaf: 75000 })).toBe(0));
  it("0 si annulée", () => expect(payableAmount({ status: "annulee", amount_xaf: 75000, paid_xaf: 0 })).toBe(0));
});

describe("splitName", () => {
  it("prénom puis le reste", () => expect(splitName("Jean Paul Mballa")).toEqual({ firstName: "Jean", lastName: "Paul Mballa" }));
  it("un seul mot", () => expect(splitName(" Awa ")).toEqual({ firstName: "Awa", lastName: "" }));
});
