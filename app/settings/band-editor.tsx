'use client';

import { useState, useTransition } from 'react';
import { restoreDefaultBands, updateGradeBands } from './actions';
import { Button, Figure } from '@/components/ui';
import { bandRanges, clampNumber } from '@/lib/grades';
import type { GradeBand } from '@/db/schema';

export function BandEditor({ bands }: { bands: GradeBand[] }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [points, setPoints] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const value = (band: GradeBand) => drafts[band.id] ?? String(band.minScore);
  const point = (band: GradeBand) => points[band.id] ?? String(band.gradePoint);

  // Preview the ranges from the drafts, so the derived ceilings move while you
  // type rather than only after saving.
  const previewed = bands.map((band) => ({
    ...band,
    minScore: Number(value(band)) || 0,
  }));
  const ranges = bandRanges(previewed, 100);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateGradeBands(
        bands.map((band) => ({
          id: band.id,
          // Clamped here as well as validated on the server: the point is to
          // prevent an out-of-range value, not to report one afterwards.
          minScore: clampNumber(Number(value(band)), 0, 100),
          gradePoint: clampNumber(Number(point(band)), 0, 10),
        })),
      );
      if (result.ok) {
        setDrafts({});
        setPoints({});
        setMessage({ ok: true, text: 'Bands saved.' });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  function restore() {
    setMessage(null);
    startTransition(async () => {
      const result = await restoreDefaultBands();
      setDrafts({});
      setPoints({});
      setMessage(
        result.ok
          ? { ok: true, text: 'Restored the Australian defaults.' }
          : { ok: false, text: result.error },
      );
    });
  }

  const dirty = Object.keys(drafts).length > 0 || Object.keys(points).length > 0;

  return (
    <div className="border border-rack-600 bg-rack-700/40">
      <ul className="divide-y divide-rack-600">
        {ranges.map(({ band, min, max }) => (
          <li key={band.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="w-10 shrink-0 font-semibold text-etch">{band.code}</span>
            <span className="min-w-0 flex-1 text-sm text-etch-dim">{band.label}</span>

            <label className="flex items-center gap-2 text-xs text-etch-dim">
              From
              <input
                type="number"
                min={0}
                max={100}
                step="any"
                value={value(band)}
                aria-label={`${band.label} threshold`}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [band.id]: event.target.value }))
                }
                className="w-20 rounded-[1px] border border-rack-600 bg-rack-900 px-2 py-1 text-right font-mono tabular-nums text-etch focus:border-lamp-live focus:outline-none"
              />
            </label>

            {/* The ceiling is derived, never entered — that is what makes gaps impossible. */}
            <Figure className="w-24 shrink-0 text-right text-xs text-etch-faint">
              {min}–{max}
            </Figure>

            <label className="flex items-center gap-2 text-xs text-etch-dim">
              Worth
              <input
                type="number"
                min={0}
                max={10}
                step="any"
                value={point(band)}
                aria-label={`${band.label} grade point`}
                onChange={(event) =>
                  setPoints((current) => ({ ...current, [band.id]: event.target.value }))
                }
                className="w-16 rounded-[1px] border border-rack-600 bg-rack-900 px-2 py-1 text-right font-mono tabular-nums text-etch focus:border-lamp-live focus:outline-none"
              />
              <span className="text-etch-faint">GP</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-rack-600 px-4 py-3">
        <Button type="button" variant="primary" onClick={save} disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save bands'}
        </Button>
        <Button type="button" onClick={restore} disabled={pending}>
          Restore defaults
        </Button>
        {message ? (
          <p
            role="status"
            className={`text-sm ${message.ok ? 'text-lamp-clear' : 'text-lamp-over'}`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
