import type { ComponentProps, ReactNode } from 'react';

/**
 * The rack's shared parts. Everything here is square-cornered and flat: paper
 * seated in a metal channel has no radius and no gradient.
 */

/**
 * A stencilled section plate. Headings carry their own weight — there is no
 * eyebrow or kicker above them anywhere in this app.
 */
export function BayLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-rack-600 pb-1.5">
      <h2 className="text-[0.8125rem] font-semibold tracking-wide text-etch-dim">{children}</h2>
      {trailing ? <div className="shrink-0 text-xs text-etch-faint">{trailing}</div> : null}
    </div>
  );
}

type ButtonVariant = 'primary' | 'quiet' | 'danger';

const BUTTON: Record<ButtonVariant, string> = {
  // The primary action is a buff plate: the one thing on the rack you write on.
  primary: 'bg-strip text-strip-ink hover:bg-[#e3dac7] active:bg-[#c8bda6]',
  quiet: 'bg-rack-700 text-etch hover:bg-rack-600 active:bg-rack-500',
  danger: 'bg-rack-700 text-lamp-over hover:bg-lamp-over hover:text-rack-900',
};

export function Button({
  variant = 'quiet',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={[
        'inline-flex items-center justify-center gap-1.5 rounded-[1px] px-3 py-1.5',
        'text-sm font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        BUTTON[variant],
        className,
      ].join(' ')}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-etch-dim">{label}</span>
      {children}
      {hint ? <span className="text-xs text-etch-faint">{hint}</span> : null}
    </label>
  );
}

const CONTROL =
  'w-full rounded-[1px] border border-rack-600 bg-rack-900 px-2.5 py-1.5 text-sm ' +
  'text-etch placeholder:text-etch-faint transition-colors ' +
  'hover:border-rack-500 focus:border-lamp-live focus:outline-none';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select {...props} className={`${CONTROL} ${className}`} />;
}

/**
 * An empty bay. Says what the space is for and offers the action, rather than
 * apologising for having nothing in it.
 */
export function EmptyBay({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-rack-600 px-5 py-8 text-center">
      <p className="text-sm text-etch-dim">{children}</p>
      {action ? <div className="mt-3.5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/**
 * A lamp: the rack's only urgency channel. Always paired with text, never the
 * sole carrier of meaning.
 */
export function Lamp({ tone }: { tone: 'live' | 'over' | 'clear' | 'off' }) {
  const fill =
    tone === 'live'
      ? 'bg-lamp-live'
      : tone === 'over'
        ? 'bg-lamp-over'
        : tone === 'clear'
          ? 'bg-lamp-clear'
          : 'bg-rack-500';
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${fill}`} />;
}

/** A figure being measured. Monospace here is for comparison, not decoration. */
export function Figure({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`font-mono tabular-nums ${className}`}>{children}</span>;
}
