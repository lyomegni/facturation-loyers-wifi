import { describe, expect, it, vi } from "vitest";
import type { MessageKind, MessageStatus, TemplateCall } from "@/lib/domain/whatsapp";
import type { SendResult } from "@/lib/whatsapp";
import { resendInvoice, runDaily, sendReceiptIfDue, type Candidate, type DispatchDeps, type WhatsappStore } from "./whatsapp-dispatch";

type Row = { id: string; invoiceId: string; kind: MessageKind; status: MessageStatus; attempts: number; day: string; phone: string; template: string };

/** Stockage en mémoire qui reproduit la réservation SQL (unicité par type, reprise des refus). */
function memoryStore(candidates: Omit<Candidate, "sent">[], today: () => string) {
  const rows: Row[] = [];
  let n = 0;
  const withSent = (c: Omit<Candidate, "sent">): Candidate => ({
    ...c,
    sent: rows.filter((r) => r.invoiceId === c.id).map((r) => ({ kind: r.kind, status: r.status, attempts: r.attempts, day: r.day })),
  });
  const store: WhatsappStore = {
    async expireStale() {},
    async candidates() {
      return candidates.map(withSent);
    },
    async candidate(id) {
      const c = candidates.find((x) => x.id === id);
      return c ? withSent(c) : null;
    },
    async reserve(invoiceId, kind, phone, template) {
      if (kind !== "renvoi") {
        const existing = rows.find((r) => r.invoiceId === invoiceId && r.kind === kind);
        if (existing) {
          if (existing.status !== "echec" || existing.attempts >= 3) return null;
          Object.assign(existing, { status: "en_cours", attempts: existing.attempts + 1, day: today(), phone, template });
          return existing.id;
        }
      }
      const row: Row = { id: `m${++n}`, invoiceId, kind, status: "en_cours", attempts: 1, day: today(), phone, template };
      rows.push(row);
      return row.id;
    },
    async finish(id, result) {
      const row = rows.find((r) => r.id === id)!;
      row.status = result.outcome;
    },
  };
  return { store, rows };
}

const base: Omit<Candidate, "sent"> = {
  id: "inv1",
  status: "a_payer",
  issued_on: "2026-11-28",
  due_on: "2026-12-05",
  paid_at: null,
  number: "FAC-2026-0001",
  label: "Loyer décembre 2026",
  amount_xaf: 75000,
  paid_xaf: 0,
  public_token: "tok",
  customer_name: "Jean Mballa",
  phone: "+237699000000",
  opt_out: false,
  org_enabled: true,
};

function setup(cands: Omit<Candidate, "sent">[], result: SendResult | ((to: string, call: TemplateCall) => Promise<SendResult>) = { outcome: "envoye", wamid: "w" }) {
  let day = "2026-11-28";
  const mem = memoryStore(cands, () => day);
  const send = vi.fn(typeof result === "function" ? result : async () => result);
  const deps = (): DispatchDeps => ({ store: mem.store, send, today: day, appUrl: "https://app", configured: true });
  return { mem, send, deps, setDay: (d: string) => (day = d) };
}

describe("runDaily", () => {
  it("envoie la facture une seule fois", async () => {
    const t = setup([base]);
    expect(await runDaily(t.deps())).toEqual({ sent: 1, failed: 0, uncertain: 0 });
    expect(t.send).toHaveBeenCalledWith("+237699000000", expect.objectContaining({ name: "facture_emise" }));
    expect(t.mem.rows[0]).toMatchObject({ kind: "facture", status: "envoye" });
    await runDaily(t.deps());
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("n'écrit à personne qui ne doit pas être contacté", async () => {
    const t = setup([
      { ...base, id: "a", opt_out: true },
      { ...base, id: "b", phone: null },
      { ...base, id: "c", org_enabled: false },
    ]);
    await runDaily(t.deps());
    await runDaily({ ...t.deps(), store: memoryStore([base], () => "2026-11-28").store, configured: false });
    expect(t.send).not.toHaveBeenCalled();
  });

  it("réessaie un refus le lendemain, 3 fois au plus", async () => {
    const t = setup([base], { outcome: "echec", error: "refus" });
    expect((await runDaily(t.deps())).failed).toBe(1);
    t.setDay("2026-11-29");
    await runDaily(t.deps());
    expect(t.mem.rows[0].attempts).toBe(2);
    t.setDay("2026-11-30");
    await runDaily(t.deps());
    t.setDay("2026-12-02");
    await runDaily(t.deps()); // j-3 : nouveau type, mais la facture n'est plus retentée
    expect(t.mem.rows.find((r) => r.kind === "facture")!.attempts).toBe(3);
    expect(t.send).toHaveBeenCalledTimes(4);
  });

  it("ne renvoie jamais un envoi incertain", async () => {
    const t = setup([base], { outcome: "incertain", error: "timeout" });
    expect((await runDaily(t.deps())).uncertain).toBe(1);
    t.setDay("2026-11-29");
    await runDaily(t.deps());
    expect(t.send).toHaveBeenCalledTimes(1);
  });

  it("une erreur sur un client n'arrête pas les autres", async () => {
    const t = setup([base, { ...base, id: "inv2" }], async (_to, _call) => {
      if (t.send.mock.calls.length === 1) throw new Error("boum");
      return { outcome: "envoye", wamid: "w2" };
    });
    await runDaily(t.deps());
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.mem.rows.find((r) => r.invoiceId === "inv2")!.status).toBe("envoye");
  });
});

describe("sendReceiptIfDue", () => {
  it("envoie le reçu une seule fois pour une facture payée", async () => {
    const t = setup([{ ...base, status: "payee", paid_at: "2026-11-28", paid_xaf: 75000 }]);
    await sendReceiptIfDue(t.deps(), "inv1");
    await sendReceiptIfDue(t.deps(), "inv1");
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.send.mock.calls[0][1].name).toBe("recu_paiement");
  });

  it("rien pour une facture encore à payer, et ne lève jamais", async () => {
    const t = setup([base]);
    await sendReceiptIfDue(t.deps(), "inv1");
    expect(t.send).not.toHaveBeenCalled();
    const broken = setup([{ ...base, status: "payee", paid_at: "2026-11-28" }], async () => {
      throw new Error("boum");
    });
    await expect(sendReceiptIfDue(broken.deps(), "inv1")).resolves.toBeUndefined();
  });
});

describe("resendInvoice", () => {
  it("compte comme la facture si elle n'est pas encore partie, puis comme un renvoi", async () => {
    const t = setup([base]);
    t.setDay("2026-11-27");
    await resendInvoice(t.deps(), "inv1");
    expect(t.mem.rows[0].kind).toBe("facture");
    t.setDay("2026-11-28");
    await runDaily(t.deps());
    expect(t.send).toHaveBeenCalledTimes(1);
    await resendInvoice(t.deps(), "inv1");
    expect(t.mem.rows[1].kind).toBe("renvoi");
  });

  it("refuse les cas interdits avec un message clair", async () => {
    const t = setup([{ ...base, opt_out: true }, { ...base, id: "paid", status: "payee", paid_at: "2026-11-28" }]);
    await expect(resendInvoice(t.deps(), "inv1")).rejects.toThrow(/pas être contacté/i);
    await expect(resendInvoice(t.deps(), "paid")).rejects.toThrow(/à payer/i);
    await expect(resendInvoice({ ...t.deps(), configured: false }, "inv1")).rejects.toThrow(/configuré/i);
    expect(t.send).not.toHaveBeenCalled();
  });
});
