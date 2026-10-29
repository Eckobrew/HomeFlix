import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "HomeFlix - Modern Self-Hosted Streaming Client",
  description: "A modern self-hosted streaming web companion integrating Jellyfin and Seerr (Jellyseerr/Overseerr) for Proxmox LXC",
  icons: {
    icon: '/favicon.ico',
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
        {children}
      </body>
    </html>
  );
}
