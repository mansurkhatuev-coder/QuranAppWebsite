import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
/** Цвет приложения (не splash) — чтобы главный экран снова был светлым */
const APP_BG = "#f4f6f8";

/**
 * Системные splash для iOS PWA (показываются во время «чёрного экрана» до загрузки сайта).
 * Web-splash после HTML убрали — на iPhone он только мелькал и был бесполезен.
 */
const APPLE_STARTUP_IMAGES = [
  {
    href: "/icons/splashes/iphone-1290x2796.png",
    media:
      "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    href: "/icons/splashes/iphone-1179x2556.png",
    media:
      "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    href: "/icons/splashes/iphone-1170x2532.png",
    media:
      "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    href: "/icons/splashes/iphone-1125x2436.png",
    media:
      "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    href: "/icons/splashes/iphone-1242x2688.png",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    href: "/icons/splashes/iphone-828x1792.png",
    media:
      "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)",
  },
  {
    href: "/icons/splashes/iphone-1242x2208.png",
    media:
      "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    href: "/icons/splashes/iphone-750x1334.png",
    media:
      "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
  },
  {
    href: "/icons/splashes/iphone-640x1136.png",
    media:
      "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)",
  },
] as const;

export const metadata: Metadata = {
  title: "Рассрочки",
  description: "Учёт рассрочек и платежей",
  applicationName: "Рассрочки",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
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
  themeColor: APP_BG,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        {APPLE_STARTUP_IMAGES.map((img) => (
          <link
            key={img.href}
            rel="apple-touch-startup-image"
            href={img.href}
            media={img.media}
          />
        ))}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PwaRegister />
        <NavigationProgressHost />
        {children}
      </body>
    </html>
  );
}
