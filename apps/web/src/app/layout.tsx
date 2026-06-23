import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "IMI - Tablero de Control RON",
  description:
    "Tablero de control de Recursos de Origen Nacional (RON) y empleo — IPECD Corrientes",
  icons: {
    icon: "/copa/assets/logo-provincia.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full`}>
      <body className={`${inter.className} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
