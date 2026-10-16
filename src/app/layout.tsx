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

/**
 * Aplica el tema ANTES del primer pintado para evitar el flash del tema
 * equivocado: usa la elección guardada ('light'|'dark') o, si nunca se
 * eligió, el tema del sistema. Debe fallar en silencio (modo privado).
 */
const ANTI_THEME_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('panoramatch-ui-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${bricolage.variable} ${instrument.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: ANTI_THEME_FLASH_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
