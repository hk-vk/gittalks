import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Editorial Typography Stack
const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "GitTalks - Listen to Repositories",
  description: "Transform GitHub repositories into AI-generated podcast episodes. Understand code through audio.",
  openGraph: {
    title: "GitTalks - Listen to Repositories",
    description: "Transform GitHub repositories into AI-generated podcast episodes. Understand code through audio.",
    url: appUrl,
    siteName: "GitTalks",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "GitTalks editorial hero artwork",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GitTalks - Listen to Repositories",
    description: "Transform GitHub repositories into AI-generated podcast episodes. Understand code through audio.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${jakartaSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
