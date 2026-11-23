import { createAdminClient } from "@/lib/supabase/server";
import { invoicePublicUrl, qrPngDataUrl } from "@/lib/qr";
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/pdf/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Facture en PDF (acquittée si payée), accessible avec le jeton imprimé dans le code QR. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return new Response("Facture introuvable", { status: 404 });
  const { data } = await createAdminClient()
    .from("invoices")
    .select(
      "number, label, amount_xaf, paid_xaf, status, issued_on, due_on, paid_at, public_token, customer:customers(name, phone), property:properties(name), org:organizations(name, address, phone, email, tax_id)",
    )
    .eq("public_token", token)
    .maybeSingle();
  if (!data) return new Response("Facture introuvable", { status: 404 });
  const inv = data as unknown as InvoicePdfData["invoice"] & {
    customer: InvoicePdfData["customer"];
    property: { name: string } | null;
    org: InvoicePdfData["org"];
  };
  const publicUrl = invoicePublicUrl(token);
  const pdf = await renderInvoicePdf({
    org: inv.org,
    invoice: inv,
    customer: inv.customer,
    propertyName: inv.property?.name ?? null,
    publicUrl,
    qrDataUrl: await qrPngDataUrl(publicUrl),
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${inv.number}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
