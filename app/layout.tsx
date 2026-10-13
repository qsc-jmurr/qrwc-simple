import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Q-SYS brand fonts, loaded and self-hosted by next/font.
const sohne = localFont({
  src: [
    { path: "./fonts/Sohne-Leicht.otf", weight: "400" },
    { path: "./fonts/Sohne-Kraftig.otf", weight: "500" },
  ],
  variable: "--sohne",
});
const sohneBreit = localFont({ src: "./fonts/SohneBreit-Kraftig.otf", variable: "--sohne-breit" });
const sohneMono = localFont({ src: "./fonts/SohneMono-Buch.otf", variable: "--sohne-mono" });

export const metadata: Metadata = {
  title: "Simple QRWC App",
  description: "Gain control of a Q-SYS system via QRWC",
  icons: [{ rel: "icon", url: "/logo-icon.svg" }],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-GB"
      className={`${sohne.variable} ${sohneBreit.variable} ${sohneMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
