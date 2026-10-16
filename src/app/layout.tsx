import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PanoraMatch — Arma el panorama, divide la cuenta",
  description:
    "Organiza panoramas con amigos, confirma asistencia sin fricción y divide gastos en pesos chilenos (CLP) con cuentas 100% transparentes.",
};

export const viewport: Viewport = {
  themeColor: "#f4efe3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${bricolage.variable} ${instrument.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
