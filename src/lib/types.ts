import type { Service, StoredStatus } from "@/lib/domain/invoicing";

export type Role = "admin" | "gestionnaire" | "lecteur";

export type Organization = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  invoice_prefix: string;
  invoice_lead_days: number;
  created_at: string;
};

export type PropertyKind = "immeuble" | "zone_wifi" | "autre";

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
  immeuble: "Immeuble",
  zone_wifi: "Zone Wi-Fi",
  autre: "Autre",
};

export type Property = {
  id: string;
  org_id: string;
  kind: PropertyKind;
  name: string;
  address: string | null;
  notes: string | null;
  archived: boolean;
};

export type Customer = {
  id: string;
  org_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
};

export type Contract = {
  id: string;
  org_id: string;
  customer_id: string;
  property_id: string;
  service: Service;
  label: string;
  unit: string | null;
  amount_xaf: number;
  due_day: number;
  start_on: string;
  end_on: string | null;
  active: boolean;
};

export type Invoice = {
  id: string;
  org_id: string;
  number: string;
  contract_id: string | null;
  customer_id: string;
  property_id: string | null;
  period: string;
  label: string;
  amount_xaf: number;
  issued_on: string;
  due_on: string;
  status: StoredStatus;
  paid_xaf: number;
  paid_at: string | null;
  public_token: string;
};

export type PaymentMethod = "especes" | "orange_money" | "mtn_momo" | "virement" | "autre";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  especes: "Espèces",
  virement: "Virement",
  autre: "Autre",
};

export type Payment = {
  id: string;
  invoice_id: string;
  amount_xaf: number;
  method: PaymentMethod;
  paid_on: string;
  reference: string | null;
  created_at: string;
};
