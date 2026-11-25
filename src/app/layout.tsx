import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource/caveat/latin-500.css";
import "@fontsource/caveat/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data room",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Data room", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf5" },
    { media: "(prefers-color-scheme: dark)", color: "#1d2430" },
  ],
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("pgd_theme")?.value;
  return (
    <html lang="en" data-theme={theme === "light" || theme === "dark" ? theme : undefined}>
      <body>{children}</body>
    </html>
  );
}
