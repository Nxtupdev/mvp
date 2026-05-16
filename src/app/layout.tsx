import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { LocaleProvider, isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display serif — used for the landing's big hero type so it
// doesn't feel like every other dark SaaS site.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NXTUP — Walk-in queue, fixed.",
  description:
    "The next-up system for barbershops. No arguments. No confusion. No lost turns.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the locale cookie server-side so the very first render already
  // has the correct language (no flash of default locale on hydration).
  // Wrapped in try/catch — if anything goes sideways reading cookies
  // (edge runtime quirks, etc.), fall back to the default rather than
  // 500'ing the entire site.
  let initialLocale: Locale = DEFAULT_LOCALE;
  try {
    const c = await cookies();
    const cookieValue = c.get("nxtup_locale")?.value;
    if (isLocale(cookieValue)) initialLocale = cookieValue;
  } catch {
    // ignore — default locale is fine
  }

  return (
    <html
      lang={initialLocale}
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LocaleProvider initial={initialLocale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
