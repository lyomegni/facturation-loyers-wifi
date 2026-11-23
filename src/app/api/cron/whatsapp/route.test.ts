import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async () => ({ data: 0, error: null }));
const query = { select: () => query, or: () => query, order: () => query, limit: async () => ({ data: [], error: null }) };
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ rpc, from: () => query }) }));

import { GET } from "./route";

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret";
  process.env.WHATSAPP_TOKEN = "tok";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
});
afterEach(() => {
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
});

describe("cron WhatsApp", () => {
  it("401 sans le secret", async () => {
    expect((await GET(new Request("https://app/api/cron/whatsapp"))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lance l'envoi du jour avec le secret", async () => {
    const res = await GET(new Request("https://app/api/cron/whatsapp", { headers: { authorization: "Bearer s3cret" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 0, failed: 0, uncertain: 0 });
    expect(rpc).toHaveBeenCalledWith("whatsapp_expire_stale");
  });
});
