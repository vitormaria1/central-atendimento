import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import A11yPreferences from "./ui/a11y-preferences";
import ThemePreferences from "./ui/theme-preferences";
import RealtimeWhatsappNotifications from "./ui/realtime-whatsapp-notifications";
import SystemNotifications from "./ui/system-notifications";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Central de Atendimento",
  description: "Central de atendimento WhatsApp (UAZAPI)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeInitScript = `
    (() => {
      try {
        const key = "theme:mode:v1";
        const raw = localStorage.getItem(key);
        const mode = raw === "day" || raw === "night" || raw === "auto" ? raw : "auto";
        const hour = new Date().getHours();
        const resolved = mode === "auto" ? (hour >= 7 && hour < 19 ? "day" : "night") : mode;
        const root = document.documentElement;
        root.dataset.theme = resolved;
        root.dataset.themeMode = mode;
      } catch {}
    })();
  `;

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <a href="#main-content" className="skip-link">
          Pular para o conteúdo
        </a>
        <SystemNotifications />
        <RealtimeWhatsappNotifications />
        <div id="main-content" className="flex-1 min-h-full">
          {children}
        </div>
        <ThemePreferences />
        <A11yPreferences />
      </body>
    </html>
  );
}
