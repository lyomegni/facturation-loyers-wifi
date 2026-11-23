import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { operatorToMethod, parseTransaction, parseWebhookParams, verifyHs256Jwt } from "./campay";

const b64url = (s: string) => Buffer.from(s).toString("base64url");

function signHs256(payload: object, key: string): string {
  const head = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
}

describe("verifyHs256Jwt", () => {
  const key = "cle-webhook";
  const good = signHs256({ status: "SUCCESSFUL" }, key);

  it("accepte un jeton signé avec la bonne clé", () => {
    expect(verifyHs256Jwt(good, key)).toEqual({ status: "SUCCESSFUL" });
  });
  it("refuse une autre clé", () => expect(verifyHs256Jwt(good, "autre-cle")).toBeNull());
  it("refuse une signature altérée", () => expect(verifyHs256Jwt(good.slice(0, -2) + "xx", key)).toBeNull());
  it("refuse alg none", () => {
    const none = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify({ status: "SUCCESSFUL" }))}.`;
    expect(verifyHs256Jwt(none, key)).toBeNull();
  });
  it("refuse un texte qui n'est pas un JWT", () => expect(verifyHs256Jwt("pas-un-jwt", key)).toBeNull());
});

describe("operatorToMethod", () => {
  it("MTN", () => expect(operatorToMethod("MTN")).toBe("mtn_momo"));
  it("orange", () => expect(operatorToMethod("orange")).toBe("orange_money"));
  it("inconnu", () => expect(operatorToMethod(undefined)).toBe("autre"));
});

describe("parseWebhookParams", () => {
  it("lit les paramètres utiles", () => {
    expect(parseWebhookParams(new URLSearchParams("reference=r1&status=SUCCESSFUL&signature=s&external_reference=inv1"))).toEqual({
      reference: "r1",
      status: "SUCCESSFUL",
      externalReference: "inv1",
      signature: "s",
    });
  });
  it("null sans référence ni signature", () => expect(parseWebhookParams(new URLSearchParams("status=SUCCESSFUL"))).toBeNull());
});

describe("parseTransaction", () => {
  it("convertit le montant en entier", () => {
    expect(
      parseTransaction({ reference: "r1", status: "SUCCESSFUL", amount: "5000", operator: "MTN", external_reference: "inv1", operator_reference: "op1" }),
    ).toEqual({ reference: "r1", status: "SUCCESSFUL", amount: 5000, operator: "MTN", externalReference: "inv1", operatorReference: "op1" });
  });
  it("lève une erreur sans référence", () => expect(() => parseTransaction({})).toThrow());
});
