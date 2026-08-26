import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSplashController } from "@/components/AppSplashController";
import { NavigationProgressHost } from "@/components/NavigationProgressHost";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://halal-rass.vercel.app";
const SPLASH_BG = "#1b3d2a";

export const metadata: Metadata = {
  title: "Рассрочки",
  description: "Учёт рассрочек и платежей",
  applicationName: "Рассрочки",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Рассрочки",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  metadataBase: new URL(APP_URL),
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: SPLASH_BG,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" style={{ backgroundColor: SPLASH_BG }}>
      <head>
        {/* Критичный splash до CSS/JS — убирает чёрный кадр в PWA */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
html,body{background:${SPLASH_BG};margin:0;min-height:100%;}
#app-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.25rem;background:${SPLASH_BG};color:#f8faf8;transition:opacity .4s ease,visibility .4s ease;}
#app-splash.app-splash--hide{opacity:0;visibility:hidden;pointer-events:none;}
#app-splash img{width:112px;height:112px;border-radius:28px;box-shadow:0 12px 40px rgba(0,0,0,.35);animation:splash-pop .55s ease both;}
#app-splash .app-splash-title{font:600 1.15rem/1.2 system-ui,sans-serif;letter-spacing:.02em;opacity:.95;}
#app-splash .app-splash-bar{width:120px;height:3px;border-radius:999px;background:rgba(255,255,255,.15);overflow:hidden;}
#app-splash .app-splash-bar>i{display:block;height:100%;width:40%;border-radius:inherit;background:linear-gradient(90deg,#c9a227,#f0e2a8,#c9a227);background-size:200% 100%;animation:splash-bar 1.1s ease-in-out infinite;}
@keyframes splash-pop{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:scale(1)}}
@keyframes splash-bar{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
@media (prefers-reduced-motion:reduce){#app-splash img,#app-splash .app-splash-bar>i{animation:none}}
            `.replace(/\s+/g, " "),
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div id="app-splash" role="status" aria-live="polite" aria-label="Загрузка приложения">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={112} height={112} decoding="async" />
          <p className="app-splash-title">Рассрочки</p>
          <div className="app-splash-bar" aria-hidden>
            <i />
          </div>
        </div>
        <AppSplashController />
        <PwaRegister />
        <NavigationProgressHost />
        {children}
      </body>
    </html>
  );
}
