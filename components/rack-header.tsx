'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Board' },
  { href: '/timetable', label: 'Timetable' },
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
          className="flex shrink-0 items-center gap-2.5 py-3 pr-3 text-etch transition-colors hover:text-lamp-live sm:pr-6"
        >
          <RackMark />
          {/*
            The wordmark is the first thing to go when the rack head runs out of
            width: four section plates plus the name overflow a 390px screen,
            and a nav you cannot reach is worse than one without its name on it.
            The mark still identifies the app.
          */}
          <span className="hidden text-[0.9375rem] font-semibold tracking-tight sm:inline">
            Uni Manager
          </span>
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
                  'relative flex items-center whitespace-nowrap px-2.5 text-sm transition-colors sm:px-4',
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
