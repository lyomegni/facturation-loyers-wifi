import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatXaf } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/dates";
import { formatPhone, maskName } from "@/lib/domain/phone";
import { remaining, type StoredStatus } from "@/lib/domain/invoicing";

export type InvoicePdfData = {
  org: { name: string; address: string | null; phone: string | null; email: string | null; tax_id: string | null };
  invoice: {
    number: string; label: string; amount_xaf: number; paid_xaf: number; status: StoredStatus;
    issued_on: string; due_on: string; paid_at: string | null;
  };
  customer: { name: string; phone: string | null };
  propertyName: string | null;
  publicUrl: string;
  qrDataUrl: string;
};

/** Helvetica (police intégrée) n'a pas l'espace fine insécable utilisée par formatXaf. */
export function pdfText(s: string): string {
  return s.replace(/[  ]/g, " ");
}

export function stampText(inv: InvoicePdfData["invoice"]): string | null {
  if (inv.status === "payee") return `ACQUITTÉE${inv.paid_at ? ` le ${formatDate(inv.paid_at)}` : ""}`;
  if (inv.status === "annulee") return "ANNULÉE";
  return null;
}

const INK = "#13222b";
const MUTED = "#55636c";
const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: INK, lineHeight: 1.4 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  org: { fontSize: 16, fontFamily: "Helvetica-Bold", lineHeight: 1.2, marginBottom: 6 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right", lineHeight: 1.2, marginBottom: 6 },
  label: { fontSize: 8, color: MUTED, textTransform: "uppercase", marginBottom: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  table: { marginTop: 24, borderTopWidth: 1.5, borderTopColor: INK },
  line: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#d5dad8" },
  totals: { marginTop: 8, alignSelf: "flex-end", width: 220 },
  stamp: { marginTop: 28, alignSelf: "center", borderWidth: 2, borderColor: "#2f7d4f", color: "#2f7d4f", paddingVertical: 6, paddingHorizontal: 18, fontSize: 18, fontFamily: "Helvetica-Bold", transform: "rotate(-4deg)" },
  footer: { position: "absolute", bottom: 36, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 0.5, borderTopColor: "#d5dad8", paddingTop: 8 },
  small: { fontSize: 8, color: MUTED },
});

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const { org, invoice: inv, customer } = data;
  const stamp = stampText(inv);
  const money = (n: number) => pdfText(formatXaf(n));
  return (
    <Document title={`Facture ${inv.number}`} author={org.name}>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <View>
            <Text style={s.org}>{org.name}</Text>
            {org.address && <Text>{org.address}</Text>}
            {org.phone && <Text>{org.phone}</Text>}
            {org.email && <Text>{org.email}</Text>}
            {org.tax_id && <Text>NIU : {org.tax_id}</Text>}
          </View>
          <View>
            <Text style={s.title}>FACTURE</Text>
            <Text style={{ textAlign: "right" }}>{inv.number}</Text>
            <Text style={{ textAlign: "right" }}>Émise le {formatDate(inv.issued_on)}</Text>
            <Text style={{ textAlign: "right" }}>Échéance : {formatDate(inv.due_on)}</Text>
          </View>
        </View>

        <View style={[s.row, { marginTop: 28 }]}>
          <View>
            <Text style={s.label}>Facturé à</Text>
            <Text style={s.bold}>{customer.name}</Text>
            {customer.phone && <Text>{formatPhone(customer.phone)}</Text>}
          </View>
          {data.propertyName && (
            <View>
              <Text style={s.label}>Bien</Text>
              <Text style={s.bold}>{data.propertyName}</Text>
            </View>
          )}
        </View>

        <View style={s.table}>
          <View style={[s.line, { borderBottomWidth: 1 }]}>
            <Text style={[s.bold, { flex: 1 }]}>Désignation</Text>
            <Text style={s.bold}>Montant</Text>
          </View>
          <View style={s.line}>
            <Text style={{ flex: 1 }}>{inv.label}</Text>
            <Text>{money(inv.amount_xaf)}</Text>
          </View>
        </View>
        <View style={s.totals}>
          <View style={s.row}><Text style={s.bold}>Total</Text><Text style={s.bold}>{money(inv.amount_xaf)}</Text></View>
          <View style={s.row}><Text>Déjà payé</Text><Text>{money(inv.paid_xaf)}</Text></View>
          <View style={s.row}><Text style={s.bold}>Reste à payer</Text><Text style={s.bold}>{money(remaining(inv))}</Text></View>
        </View>

        {stamp && <Text style={[s.stamp, inv.status === "annulee" ? { borderColor: MUTED, color: MUTED } : {}]}>{stamp}</Text>}

        <View style={s.footer} fixed>
          <View style={{ maxWidth: 380 }}>
            <Text style={s.small}>Scannez ce code pour vérifier l'authenticité de cette facture et son état de paiement :</Text>
            <Text style={s.small}>{data.publicUrl}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={data.qrDataUrl} style={{ width: 80, height: 80 }} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoicePdf data={data} />);
}

/** Client tel qu'il apparaît sur le PDF public : nom masqué, sans téléphone (comme la page /f). */
export function publicCustomer(c: InvoicePdfData["customer"]): InvoicePdfData["customer"] {
  return { name: maskName(c.name), phone: null };
}
