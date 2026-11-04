import type { Metadata } from "next";
import "./globals.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/fraunces";
import { STORE, siteUrl } from "@/lib/store";

const SITE = siteUrl();
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: STORE.name, template: `%s | ${STORE.name}` },
  description: STORE.tagline,
  openGraph: { type: "website", siteName: STORE.name, url: SITE },
  robots: { index: true, follow: true },
};

// Only the document shell lives here: the storefront frame (and its database reads) is in (store)/layout.tsx,
// so admin pages do not pay for the shop header on every navigation.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} /></head>
    <body>{children}</body></html>;
}
