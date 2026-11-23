import { describe, expect, it } from "vitest";
import { toCandidate, type Row } from "./whatsapp-store";

const row: Row = {
  id: "inv1",
  status: "a_payer",
  issued_on: "2026-11-28",
  due_on: "2026-12-05",
  paid_at: null,
  number: "FAC-2026-0001",
  label: "Loyer",
  amount_xaf: 75000,
  paid_xaf: 0,
  public_token: "tok",
  customer: { name: "Jean", phone: "+237699000000", whatsapp_opt_out: false },
  org: { whatsapp_enabled: true },
  messages: [{ kind: "facture", status: "lu", attempts: 1, attempted_at: "2026-11-28T23:30:00Z" }],
};

describe("toCandidate", () => {
  it("date les envois au jour de Douala de la dernière tentative", () => {
    expect(toCandidate(row).sent).toEqual([{ kind: "facture", status: "lu", attempts: 1, day: "2026-11-29" }]);
  });

  it("client ou espace absents : non contactable", () => {
    const c = toCandidate({ ...row, customer: null, org: null, messages: null });
    expect(c).toMatchObject({ phone: null, opt_out: false, org_enabled: false, sent: [], customer_name: "" });
  });
});
