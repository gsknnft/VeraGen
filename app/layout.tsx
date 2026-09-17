import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "loopface",
  description: "One face photo in, a shareable video out.",
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
