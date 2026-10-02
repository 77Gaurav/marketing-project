import Link from 'next/link';
import { Radio } from 'lucide-react';

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Campaign builder', href: '#workflow' },
      { label: 'Venue matching', href: '#locations' },
      { label: 'Publishing', href: '#workflow' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
  {
    heading: 'Venue network',
    links: [
      { label: 'Café displays', href: '#venues' },
      { label: 'Gyms & fitness', href: '#venues' },
      { label: 'Apparel & footwear', href: '#venues' },
      { label: 'Start a campaign', href: '#pricing' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { label: 'How it works', href: '#product' },
      { label: 'Capabilities', href: '#workflow' },
      { label: 'Reporting', href: '#locations' },
      { label: 'Talk to sales', href: '#contact' },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper-raised px-5 pb-10 pt-16 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-shell">
        <div className="grid gap-12 pb-14 md:grid-cols-12">
          <div className="md:col-span-5">
            <Link href="/" className="inline-flex min-h-[44px] items-center gap-2.5 rounded-md text-ink">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-paper-raised">
                <Radio className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="text-[1.1875rem] font-semibold tracking-tight">
                String<span className="text-ink-muted">Theory</span>
              </span>
            </Link>
            <p className="measure mt-5 text-[length:var(--type-small)] leading-relaxed text-ink-muted">
              The advertising platform that puts brands on the screens their audience already visits.
            </p>
            <p className="mt-6 font-sans text-[length:var(--type-eyebrow)] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Brand → Audience → Venues → Advertise
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading} className="md:col-span-2">
              <h2 className="type-eyebrow text-ink-muted">{column.heading}</h2>
              <ul className="mt-5 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="inline-flex min-h-tap items-center text-[length:var(--type-small)] text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="md:col-span-1" aria-hidden="true" />
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[length:var(--type-small)] text-ink-muted">
            © {year} String Theory Inc. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {['Privacy', 'Terms', 'Security', 'Status'].map((item) => (
              <li key={item}>
                <a
                  href="#"
                  className="inline-flex min-h-tap items-center text-[length:var(--type-small)] text-ink-muted transition-colors duration-fast ease-out hover:text-ink"
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}