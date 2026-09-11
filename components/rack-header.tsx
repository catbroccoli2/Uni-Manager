'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Board' },
  { href: '/semesters', label: 'Semesters' },
  { href: '/settings', label: 'Settings' },
] as const;

/**
 * The rack head: the strip of metal above the bays that carries the board's
 * identity and its section plates.
 *
 * A client component only because the active section is derived from the
 * pathname. Everything it renders is static.
 */
export function RackHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-rack-600 bg-rack-900/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-stretch gap-1 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 py-3 pr-6 text-etch transition-colors hover:text-lamp-live"
        >
          <RackMark />
          <span className="text-[0.9375rem] font-semibold tracking-tight">Uni Manager</span>
        </Link>

        <nav aria-label="Sections" className="flex items-stretch">
          {LINKS.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'relative flex items-center px-4 text-sm transition-colors',
                  // The active section is a lit plate, not a coloured pill: the
                  // lamp hue is reserved for urgency and may not mean "selected".
                  active
                    ? 'text-etch after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-etch'
                    : 'text-etch-dim hover:text-etch',
                ].join(' ')}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

/**
 * Three seated strips in a rack, at icon scale. Drawn rather than borrowed:
 * the mark is the product's own object.
 */
function RackMark() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-5 w-5"
      role="img"
      aria-label=""
      focusable="false"
      fill="none"
    >
      <rect x="2" y="3.5" width="16" height="3.5" rx="0.5" fill="currentColor" />
      <rect x="2" y="8.25" width="11" height="3.5" rx="0.5" fill="currentColor" opacity="0.62" />
      <rect x="2" y="13" width="6" height="3.5" rx="0.5" fill="currentColor" opacity="0.34" />
    </svg>
  );
}
