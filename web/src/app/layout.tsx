import { SerwistProvider } from "@serwist/turbopack/react";
import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import type { ReactNode } from "react";
import { FlagPolyfill } from "@/components/FlagPolyfill";
import "./globals.css";

// next/font downloads these at build time and serves them from our own domain: no runtime Google requests.
const body = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-dawn-body", display: "swap" });
const display = Sora({ subsets: ["latin", "latin-ext"], variable: "--font-dawn-display", display: "swap" });

export const metadata: Metadata = {
  applicationName: "Dawn",
  title: { default: "Dawn — your morning world brief", template: "%s · Dawn" },
  description: "Understand what is happening in the world in two or three minutes.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Dawn" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#04060d",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${body.variable} ${display.variable}`}>
      <body>
        <FlagPolyfill />
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
      </body>
    </html>
  );
}
