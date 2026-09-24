import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site-info";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL), title: SITE_TITLE, description: SITE_DESCRIPTION,
  alternates: { canonical: "/" }, robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "zh_CN", url: SITE_URL, siteName: "订阅观察", title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary", title: SITE_TITLE, description: SITE_DESCRIPTION },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
