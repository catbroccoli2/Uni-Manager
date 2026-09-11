import type { UnitColor } from '@/db/schema';

/**
 * Tailwind scans source for complete class names, so `bg-unit-${color}` would
 * compile to nothing. The map keeps every class literal and in one place.
 *
 * Ink is always the rack's own near-black rather than white: these hues are
 * mid-tone by design, and dark ink clears 4.5:1 on all eight where white does
 * not clear it on any.
 */
const PLATE: Record<UnitColor, string> = {
  amber: 'bg-unit-amber',
  rose: 'bg-unit-rose',
  violet: 'bg-unit-violet',
  cyan: 'bg-unit-cyan',
  emerald: 'bg-unit-emerald',
  orange: 'bg-unit-orange',
  blue: 'bg-unit-blue',
  pink: 'bg-unit-pink',
};

const INK: Record<UnitColor, string> = {
  amber: 'text-unit-amber',
  rose: 'text-unit-rose',
  violet: 'text-unit-violet',
  cyan: 'text-unit-cyan',
  emerald: 'text-unit-emerald',
  orange: 'text-unit-orange',
  blue: 'text-unit-blue',
  pink: 'text-unit-pink',
};

export function unitPlateClass(color: UnitColor): string {
  return PLATE[color];
}

export function unitInkClass(color: UnitColor): string {
  return INK[color];
}

/**
 * A unit's painted plate. PRD.md §11's coloured tag, rendered as a plate on the
 * rack rather than a rounded pill, because nothing else in this world has a
 * radius.
 *
 * Colour alone never carries the identity: the plate always shows the code (or
 * the name when there is no code), so the tag survives a colour-blind reader and
 * a greyscale print.
 */
export function UnitPlate({
  color,
  code,
  name,
  size = 'md',
}: {
  color: UnitColor;
  code: string | null;
  name: string;
  size?: 'sm' | 'md';
}) {
  const label = code ?? name;
  return (
    <span
      className={[
        PLATE[color],
        'inline-flex shrink-0 items-center rounded-[1px] font-semibold text-rack-900',
        size === 'sm' ? 'px-1.5 py-px text-[0.6875rem]' : 'px-2 py-0.5 text-xs',
      ].join(' ')}
      title={code ? `${code} — ${name}` : name}
    >
      {label}
    </span>
  );
}
