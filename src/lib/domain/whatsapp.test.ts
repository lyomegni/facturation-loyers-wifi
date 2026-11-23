import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatXaf } from "./money";
import { KIND_LABELS, STATUS_LABELS, nextMessage, parseStatusUpdates, templateFor, verifyMetaSignature, type MessageKind, type MessageStatus, type SentMessage } from "./whatsapp";

const inv = { status: "a_payer", issued_on: "2026-11-28", due_on: "2026-12-05", paid_at: null } as const;
const s = (kind: MessageKind, day: string, status: MessageStatus = "envoye", attempts = 1): SentMessage => ({ kind, status, attempts, day });

describe("nextMessage", () => {
  it("envoie la facture le jour de l'émission, avec 2 jours de rattrapage", () => {
    expect(nextMessage(inv, [], "2026-11-28")).toBe("facture");
    expect(nextMessage(inv, [], "2026-11-30")).toBe("facture");
    expect(nextMessage(inv, [], "2026-12-01")).toBeNull();
  });

  it("enchaîne les rappels sans rattraper les anciens", () => {
    expect(nextMessage(inv, [s("facture", "2026-11-28")], "2026-12-02")).toBe("rappel_j-3");
    expect(nextMessage(inv, [s("facture", "2026-11-28"), s("rappel_j-3", "2026-12-02")], "2026-12-05")).toBe("rappel_j");
    expect(nextMessage(inv, [s("facture", "2026-11-28")], "2026-12-05")).toBe("rappel_j");
    expect(nextMessage(inv, [s("facture", "2026-11-28"), s("rappel_j", "2026-12-05")], "2026-12-06")).toBeNull();
    expect(nextMessage(inv, [s("facture", "2026-11-28")], "2026-12-08")).toBe("rappel_j+3");
    expect(nextMessage(inv, [s("rappel_j+3", "2026-12-08")], "2026-12-12")).toBe("rappel_j+7");
  });

  it("ignore les vieilles dettes", () => {
    expect(nextMessage(inv, [], "2026-12-13")).toBeNull();
  });

  it("un seul message par jour et par facture", () => {
    expect(nextMessage(inv, [s("renvoi", "2026-12-02")], "2026-12-02")).toBeNull();
  });

  it("réessaie un refus explicite, au plus 3 fois, jamais un envoi incertain", () => {
    expect(nextMessage(inv, [s("facture", "2026-11-28", "echec", 1)], "2026-11-29")).toBe("facture");
    expect(nextMessage(inv, [s("facture", "2026-11-28", "echec", 3)], "2026-11-29")).toBeNull();
    expect(nextMessage(inv, [s("facture", "2026-11-28", "incertain")], "2026-11-29")).toBeNull();
  });

  it("ignore les rappels antérieurs à l'émission", () => {
    const late = { ...inv, issued_on: "2026-12-04" };
    expect(nextMessage(late, [s("facture", "2026-12-04")], "2026-12-05")).toBe("rappel_j");
  });

  it("rien pour une facture annulée", () => {
    expect(nextMessage({ ...inv, status: "annulee" }, [], "2026-11-28")).toBeNull();
  });

  it("reçu une fois, hors limite journalière, pas trop tard", () => {
    const paid = { ...inv, status: "payee", paid_at: "2026-12-03" } as const;
    expect(nextMessage(paid, [s("rappel_j-3", "2026-12-03")], "2026-12-03")).toBe("recu");
    expect(nextMessage(paid, [s("recu", "2026-12-03")], "2026-12-04")).toBeNull();
    expect(nextMessage(paid, [], "2026-12-06")).toBeNull();
  });
});

describe("templateFor", () => {
  const tpl = {
    number: "FAC-2026-0001",
    label: "Loyer décembre 2026",
    amount_xaf: 75000,
    paid_xaf: 25000,
    due_on: "2026-12-05",
    paid_at: "2026-12-03",
    public_token: "tok",
    customer_name: "Jean Mballa",
    org_name: "Immeuble Les Palmiers",
  };

  it("rappel de retard avec le reste à payer", () => {
    expect(templateFor("rappel_j+3", tpl, "https://app")).toEqual({
      name: "rappel_retard",
      params: ["Jean Mballa", "Immeuble Les Palmiers", "FAC-2026-0001", "Loyer décembre 2026", "05/12/2026", formatXaf(50000), "https://app/f/tok"],
    });
  });

  it("facture, rappels avant et à l'échéance", () => {
    expect(templateFor("facture", tpl, "https://app")).toEqual({
      name: "facture_emise",
      params: ["Jean Mballa", "Immeuble Les Palmiers", "FAC-2026-0001", "Loyer décembre 2026", formatXaf(75000), "05/12/2026", "https://app/f/tok"],
    });
    expect(templateFor("rappel_j-3", tpl, "https://app").name).toBe("rappel_avant_echeance");
    expect(templateFor("rappel_j", tpl, "https://app")).toEqual({
      name: "rappel_echeance",
      params: ["Jean Mballa", "Immeuble Les Palmiers", "FAC-2026-0001", "Loyer décembre 2026", formatXaf(50000), "https://app/f/tok"],
    });
    expect(templateFor("renvoi", tpl, "https://app").name).toBe("facture_emise");
  });

  it("nettoie les paramètres refusés par Meta (retours à la ligne, tabulations, espaces multiples, vide)", () => {
    const call = templateFor("facture", { ...tpl, label: "Loyer\n décembre\t2026     appt 3", number: "" }, "https://app");
    expect(call.params[3]).toBe("Loyer décembre 2026 appt 3");
    expect(call.params[2]).toBe("—");
  });

  it("reçu avec le lien vers le PDF acquitté", () => {
    const call = templateFor("recu", { ...tpl, paid_xaf: 75000 }, "https://app");
    expect(call.name).toBe("recu_paiement");
    expect(call.params).toEqual(["Jean Mballa", "Immeuble Les Palmiers", formatXaf(75000), "FAC-2026-0001", "Loyer décembre 2026", "03/12/2026", "https://app/api/factures/tok/pdf"]);
  });
});

describe("webhook Meta", () => {
  const body = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                { id: "wamid.1", status: "delivered" },
                { id: "wamid.2", status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] },
                { id: "wamid.3", status: "deleted" },
              ],
            },
          },
        ],
      },
    ],
  });
  const sig = "sha256=" + createHmac("sha256", "secret").update(body).digest("hex");

  it("vérifie la signature sur le corps brut", () => {
    expect(verifyMetaSignature(body, sig, "secret")).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, "secret")).toBe(false);
    expect(verifyMetaSignature(body, sig, "autre")).toBe(false);
    expect(verifyMetaSignature(body, null, "secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", "secret")).toBe(false);
  });

  it("lit les statuts de remise et ignore le reste", () => {
    expect(parseStatusUpdates(JSON.parse(body))).toEqual([
      { wamid: "wamid.1", status: "remis", error: null },
      { wamid: "wamid.2", status: "non_remis", error: "Message undeliverable" },
    ]);
    expect(parseStatusUpdates({ entry: [{ changes: [{ value: { messages: [{ id: "x" }] } }] }] })).toEqual([]);
    expect(parseStatusUpdates("n'importe quoi")).toEqual([]);
    expect(parseStatusUpdates({ entry: [{ changes: [{ value: { statuses: [{ status: "read" }, null] } }] }] })).toEqual([]);
  });
});

describe("libellés", () => {
  it("types et statuts lisibles", () => {
    expect(KIND_LABELS["rappel_j+3"]).toBe("Rappel J+3");
    expect(KIND_LABELS.renvoi).toBe("Renvoi manuel");
    expect(STATUS_LABELS.echec).toBe("Refusé par WhatsApp");
    expect(STATUS_LABELS.non_remis).toBe("Non remis");
  });
});
