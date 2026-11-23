import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordCampayPayment } from "./payments";
import type { CampayTransaction } from "./domain/campay";

const INV = "0b6f6a52-1d1b-4c5e-9f3b-7f1b2c3d4e5f";

function fakeDb(result: { data: unknown; error: { message: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return result;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const tx: CampayTransaction = { reference: "r1", status: "SUCCESSFUL", amount: 75000, operator: "MTN", externalReference: INV, operatorReference: "op1" };

describe("recordCampayPayment", () => {
  it("ignore une transaction non réussie sans toucher la base", async () => {
    const f = fakeDb({ data: "enregistre", error: null });
    expect(await recordCampayPayment(f.db, { ...tx, status: "FAILED" }, "2026-11-23")).toBe("ignore_statut");
    expect(f.calls).toHaveLength(0);
  });

  it("facture introuvable si la référence externe n'est pas un identifiant", async () => {
    const f = fakeDb({ data: "enregistre", error: null });
    expect(await recordCampayPayment(f.db, { ...tx, externalReference: null }, "2026-11-23")).toBe("facture_introuvable");
    expect(await recordCampayPayment(f.db, { ...tx, externalReference: "abc" }, "2026-11-23")).toBe("facture_introuvable");
    expect(f.calls).toHaveLength(0);
  });

  it("enregistre via la fonction SQL avec les bons paramètres", async () => {
    const f = fakeDb({ data: "deja_enregistre", error: null });
    expect(await recordCampayPayment(f.db, tx, "2026-11-23")).toBe("deja_enregistre");
    expect(f.calls[0]).toEqual({
      fn: "record_provider_payment",
      args: { p_invoice: INV, p_amount: 75000, p_method: "mtn_momo", p_paid_on: "2026-11-23", p_provider: "campay", p_provider_ref: "r1", p_reference: "op1" },
    });
  });

  it("propage une erreur de base", async () => {
    const f = fakeDb({ data: null, error: { message: "boom" } });
    await expect(recordCampayPayment(f.db, tx, "2026-11-23")).rejects.toThrow("boom");
  });
});
