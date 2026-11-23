import { describe, expect, it } from "vitest";
import { parseCustomerSheet, parseService } from "./import";

describe("parseCustomerSheet", () => {
  it("lit un fichier type", () => {
    const res = parseCustomerSheet([
      ["Nom du locataire", "Téléphone WhatsApp", "Immeuble", "Appartement", "Loyer", "Jour d'échéance", "Date d'entrée"],
      ["Jean Mballa", "699 00 00 00", "Immeuble Bonamoussadi", "B2", "75 000", "5", "01/03/2025"],
      ["", "", "", "", "", "", ""],
      ["Awa Nji", "677112233", "Zone Wi-Fi Ndogbong", "", "10000", "31", ""],
    ]);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ name: "Jean Mballa", phone: "+237699000000", unit: "B2", amount: 75000, dueDay: 5, startOn: "2025-03-01", service: "loyer" });
    expect(res.rows[1]).toMatchObject({ service: "wifi", dueDay: 28, amount: 10000 });
  });

  it("signale les erreurs ligne par ligne", () => {
    const res = parseCustomerSheet([
      ["Nom", "Tel", "Montant"],
      ["A", "123", "1000"],
      ["B", "", "abc"],
      ["", "699000000", "5"],
    ]);
    expect(res.rows).toHaveLength(0);
    expect(res.errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it("exige une colonne Nom", () => {
    expect(parseCustomerSheet([["Téléphone"], ["699000000"]]).errors[0].message).toMatch(/Nom/);
  });

  it("parseService", () => {
    expect(parseService("Abonnement internet")).toBe("wifi");
    expect(parseService("Loyer")).toBe("loyer");
    expect(parseService("Gardiennage")).toBe("autre");
  });
});
