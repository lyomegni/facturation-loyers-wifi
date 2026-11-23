import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PayeFacile", template: "%s · PayeFacile" },
  description: "Facturation des loyers et des abonnements Wi-Fi, relances WhatsApp et paiement Mobile Money.",
};

export const viewport: Viewport = {
  themeColor: "#13222b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
