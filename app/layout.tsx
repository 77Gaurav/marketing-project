import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';

/**
 * Two-font type system — see design-system/string-theory/MASTER.md §1
 * Poppins carries display voice; Inter carries every readable surface.
 * Self-hosted by next/font: no layout shift, no external font request.
 */
const display = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://stringtheory.example'),
  title: {
    default: 'String Theory — Turn Real-World Screens Into Real Results',
    template: '%s · String Theory',
  },
  description:
    'String Theory connects brands with the physical store displays their audience actually visits. Target an audience, discover matching screens, deploy video, and measure every play.',
  keywords: [
    'DOOH',
    'Digital Out of Home',
    'Retail Media',
    'Video Advertising',
    'Store Screens',
    'Audience Targeting',
  ],
  openGraph: {
    title: 'String Theory — Turn Real-World Screens Into Real Results',
    description:
      'Target an audience, discover matching screens, deploy video, and measure every play.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-paper font-sans text-ink">
        <a
          href="#main"
          className="sr-only rounded-md bg-ink px-5 py-3 text-base font-medium text-paper-raised focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}