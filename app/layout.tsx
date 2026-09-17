import type { Metadata } from "next";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — Ideas into motion`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  icons: { icon: [{ url: "/favicon.ico", sizes: "32x32" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-icon.png" },
  openGraph: { title: `${BRAND.name} — Ideas into motion`, description: BRAND.description, type: "website" },
  twitter: { card: "summary_large_image", title: BRAND.name, description: BRAND.description },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
