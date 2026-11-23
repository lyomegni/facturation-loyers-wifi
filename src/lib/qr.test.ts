import { describe, expect, it } from "vitest";
import { qrPngDataUrl } from "./qr";

describe("qrPngDataUrl", () => {
  it("renvoie une image PNG en data URL", async () => {
    expect(await qrPngDataUrl("https://app.test/f/abc")).toMatch(/^data:image\/png;base64,/);
  });
});
