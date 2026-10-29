import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ProfileProvider } from "@/context/ProfileContext";
import { ProfileSelectorModal } from "@/components/ProfileSelectorModal";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://homeflix.eckonet.uk';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "HomeFlix - Modern Self-Hosted Streaming Client",
    template: "%s | HomeFlix",
  },
  description: "A modern self-hosted streaming web companion integrating Jellyfin and Seerr (Jellyseerr/Overseerr) with multi-profile continue watching and Google Cast.",
  keywords: [
    "HomeFlix",
    "Jellyfin",
    "Overseerr",
    "Jellyseerr",
    "Streaming Client",
    "Self-Hosted",
    "Chromecast",
    "Movies",
    "TV Shows",
    "Media Server",
  ],
  authors: [{ name: "HomeFlix" }],
  creator: "HomeFlix",
  publisher: "HomeFlix",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "HomeFlix - Modern Self-Hosted Streaming Client",
    description: "Watch your personal movie and TV collection with multi-profile continue watching, Chromecast support, and 1-click media requests.",
    url: siteUrl,
    siteName: "HomeFlix",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "HomeFlix - Modern Self-Hosted Streaming Client",
    description: "Watch your personal movie and TV collection with multi-profile continue watching and Chromecast support.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-[#141414]">
      <head>
        <meta name="theme-color" content="#141414" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${siteUrl}/#website`,
                  "url": siteUrl,
                  "name": "HomeFlix",
                  "description": "Modern Self-Hosted Streaming Client for Jellyfin and Seerr",
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": `${siteUrl}/?search={search_term_string}`,
                    "query-input": "required name=search_term_string",
                  },
                },
                {
                  "@type": "SoftwareApplication",
                  "@id": `${siteUrl}/#software`,
                  "name": "HomeFlix",
                  "applicationCategory": "EntertainmentApplication",
                  "operatingSystem": "Web, Android, iOS, ChromeOS",
                  "offers": {
                    "@type": "Offer",
                    "price": "0",
                    "priceCurrency": "USD",
                  },
                },
              ],
            }),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window['__onGCastApiAvailable'] = function(isAvailable) {
                if (isAvailable && window.cast && window.cast.framework) {
                  window.__castFrameworkReady = true;
                  try {
                    window.cast.framework.CastContext.getInstance().setOptions({
                      receiverApplicationId: 'CC1AD845',
                      autoJoinPolicy: 'origin_scoped'
                    });
                  } catch (e) {
                    console.warn('[Cast SDK] setOptions error:', e);
                  }
                }
              };
            `,
          }}
        />
        <script
          src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"
          async
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#141414] text-white`}
      >
        <ProfileProvider>
          {children}
          <ProfileSelectorModal />
        </ProfileProvider>
      </body>
    </html>
  );
}
