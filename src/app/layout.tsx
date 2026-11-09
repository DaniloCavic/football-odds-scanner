import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Football Odds Scanner",
  description: "Skeniranje kvota, filter i praćenje prolaznosti fudbalskih tipova.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1120" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
