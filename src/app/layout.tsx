import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { WalletContextProvider } from "@/context/WalletContextProvider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hypebiscus",
  description: "Hypebiscus",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://terminal.jup.ag/main-v4.js"
          strategy="beforeInteractive"
          data-preload
          defer
          // Note: Add SRI hash in production - check Jupiter docs for current hash
          // integrity="sha384-HASH_HERE"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
        <Toaster /> 
      </body>
    </html>
  );
}