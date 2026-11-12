import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Inter,
  Lora,
  Montserrat,
  Playfair_Display,
  Poppins,
} from "next/font/google";
import "./globals.css";

/**
 * Layout raíz. Carga con next/font TODAS las tipografías del registro técnico
 * (lib/fonts.ts) para que el admin pueda cambiar fuentes en caliente sin
 * recargar el servidor: el tema solo referencia sus variables CSS.
 * Idioma: español (única lengua del negocio).
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Catering con Corazón",
  description:
    "Catering para eventos privados en Ecuador. La página raíz define los metadatos definitivos desde la base de datos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const fontVariables = `${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${lora.variable} ${montserrat.variable} ${inter.variable} ${poppins.variable}`;
  return (
    // Las variables de tipografía se declaran en <html> (:root) para que el
    // bloque de tema dinámico (:root{--font-heading: var(--font-lora)}) las
    // resuelva correctamente en cualquier contexto.
    <html lang="es" className={fontVariables} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
