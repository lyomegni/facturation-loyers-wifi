import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";
import { formatXaf, parseXaf } from "./money";

describe("normalizePhone", () => {
  it.each([
    ["699 00 00 00", "+237699000000"],
    ["6 99 00 00 00", "+237699000000"],
    ["+237 699-00-00-00", "+237699000000"],
    ["00237699000000", "+237699000000"],
    ["237699000000", "+237699000000"],
    ["222 23 45 67", "+237222234567"],
    ["+33 6 12 34 56 78", "+33612345678"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));

  it("rejette les numéros invalides", () => {
    expect(normalizePhone("12345")).toBe("invalid");
    expect(normalizePhone("799000000")).toBe("invalid");
    expect(normalizePhone("abc")).toBe("invalid");
    expect(normalizePhone("")).toBeNull();
  });

  it("formatPhone", () => expect(formatPhone("+237699000000")).toBe("+237 6 99 00 00 00"));
});

describe("montants", () => {
  it("formatXaf", () => expect(formatXaf(1250000)).toBe("1 250 000 FCFA"));
  it.each([["25 000", 25000], ["25.000 F", 25000], ["15000 FCFA", 15000], [5000, 5000]])("parseXaf %s", (i, o) => expect(parseXaf(i)).toBe(o));
  it("parseXaf invalide", () => {
    expect(parseXaf("abc")).toBeNull();
    expect(parseXaf(0)).toBeNull();
    expect(parseXaf(12.5)).toBeNull();
  });
});
