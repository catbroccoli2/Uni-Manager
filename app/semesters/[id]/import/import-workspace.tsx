'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parseOutline, type OutlineDraft } from '@/lib/outline-parser';
import { commitOutlineDraft } from '@/app/units/import-actions';
import { weightingAllowance } from '@/lib/grades';
import { formatShortDate } from '@/lib/dates';
import { Button, BayLabel, Field, Figure, Input, Select } from '@/components/ui';
import { UNIT_COLORS, type UnitColor } from '@/db/schema';
import { unitPlateClass } from '@/components/unit-pill';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface ExistingUnit {
  id: number;
  code: string | null;
  name: string;
  assessmentCount: number;
  /** Weight its current assessments already claim, out of 100. */
  weightingUsed: number;
}

/**
 * Paste, review, commit.
 *
 * The parser runs entirely in the browser — it is a pure function over a string
 * with no network and no database — so the draft appears as fast as the text
 * can be read, and an outline the user decides not to import never leaves the
 * machine at all.
 *
 * Everything in the review is editable, and every row can be dropped. Low
 * confidence rows lead, each showing the line it was read from: a guessing
 * parser has to show its working rather than present a clean-looking answer.
 */
export function ImportWorkspace({
  semesterId,
  semesterStart,
  existingUnits,
}: {
  semesterId: number;
  semesterStart: string | null;
  existingUnits: ExistingUnit[];
}) {
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<OutlineDraft | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Editable copies of the parsed rows, plus whether each is still included.
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [unitName, setUnitName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [creditPoints, setCreditPoints] = useState('');
  const [color, setColor] = useState<UnitColor>('violet');
  const [targetUnitId, setTargetUnitId] = useState<number | null>(null);

  /**
   * Reads a dropped or chosen PDF in the browser and fills the textarea with
   * its text. Nothing is uploaded — PDF.js runs client-side — so this stays as
   * local as pasting, and the file never leaves the machine.
   */
  async function readPdf(file: File) {
    setError(null);
    setFileNote(null);
    setReading(true);
    try {
      const { extractPdfText } = await import('@/lib/pdf-text');
      const result = await extractPdfText(file);

      if (result.looksScanned) {
        setFileNote(
          `${file.name} has no text layer — it is almost certainly a scan. There is nothing to ` +
            'read without OCR, so paste the text by hand if you can select it elsewhere.',
        );
        return;
      }
      setText(result.text);
      setFileNote(`Read ${result.pageCount} pages from ${file.name}.`);
    } catch {
      setError('Could not read that PDF. Try copying its text and pasting instead.');
    } finally {
      setReading(false);
    }
  }

  function read() {
    setError(null);
    const parsed = parseOutline(text, { semesterStart });
    setDraft(parsed);
    setUnitName(parsed.unit.name ?? '');
    setUnitCode(parsed.unit.code ?? '');
    setCreditPoints(parsed.unit.creditPoints === null ? '' : String(parsed.unit.creditPoints));

    // If the outline names a unit already in this semester, default to adding
    // to it rather than silently creating a duplicate.
    const match = parsed.unit.code
      ? existingUnits.find((unit) => unit.code?.toUpperCase() === parsed.unit.code?.toUpperCase())
      : undefined;
    setTargetUnitId(match?.id ?? null);

    const initial: Record<string, boolean> = {};
    // Breakdown rows start off. Their weightings are already counted in the
    // parent row above them, so importing both counts the same work twice and
    // pushes the unit past 100.
    parsed.assessments.forEach((row, i) => (initial[`a${i}`] = !row.isSubItem));
    parsed.timetable.forEach((_, i) => (initial[`t${i}`] = true));
    // Readings are the weakest extraction, so they start unticked: opting in is
    // a smaller mistake than importing a paragraph that was never a reading.
    parsed.sources.forEach((_, i) => (initial[`s${i}`] = false));
    setKeep(initial);
  }

  const chosen = useMemo(() => {
    if (!draft) return null;
    return {
      assessments: draft.assessments.filter((_, i) => keep[`a${i}`]),
      timetable: draft.timetable.filter((_, i) => keep[`t${i}`]),
      sources: draft.sources.filter((_, i) => keep[`s${i}`]),
    };
  }, [draft, keep]);

  const target = existingUnits.find((unit) => unit.id === targetUnitId) ?? null;
  const weightTotal = chosen?.assessments.reduce((sum, a) => sum + a.weighting, 0) ?? 0;
  // Merging leaves only what the unit's existing assessments have not claimed.
  // The server caps for real against freshly read rows; this is so the figure
  // on screen matches what will happen.
  const allowance = target ? weightingAllowance([{ weighting: target.weightingUsed }]) : 100;
  const overAllowance = weightTotal > allowance + 0.001;

  function commit() {
    if (!draft || !chosen) return;
    setError(null);
    startTransition(async () => {
      const result = await commitOutlineDraft({
        semesterId,
        targetUnitId,
        unit: {
          name: unitName.trim() || unitCode.trim() || 'Untitled unit',
          code: unitCode.trim() || null,
          color,
          creditPoints: creditPoints.trim() === '' ? null : Number(creditPoints),
        },
        assessments: chosen.assessments.map((a) => ({
          name: a.name,
          dueDate: a.dueDate,
          weighting: a.weighting,
          maxMark: a.maxMark,
          type: a.type,
        })),
        timetable: chosen.timetable.map((t) => ({
          dayOfWeek: t.dayOfWeek,
          startTime: t.startTime,
          endTime: t.endTime,
          location: t.location,
          type: t.type,
        })),
        sources: chosen.sources.map((s) => ({
          title: s.title,
          urlOrFileRef: s.urlOrFileRef,
          type: s.urlOrFileRef ? ('link' as const) : ('reading' as const),
        })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/units/${result.unitId}`);
    });
  }

  if (draft === null) {
    return (
      <section>
        <BayLabel trailing="PDF or plain text">Load the outline</BayLabel>
        <div className="space-y-3">
          {/*
            The PDF is read in this browser by PDF.js. It is never uploaded, so
            this path is exactly as offline as pasting.
          */}
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void readPdf(file);
            }}
            className="flex flex-wrap items-center gap-3 border border-dashed border-rack-600 px-4 py-3"
          >
            <label className="cursor-pointer rounded-[1px] bg-rack-700 px-3 py-1.5 text-sm text-etch transition-colors hover:bg-rack-600">
              {reading ? 'Reading…' : 'Choose a PDF'}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                aria-label="Outline PDF"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readPdf(file);
                }}
              />
            </label>
            <span className="text-xs text-etch-faint">
              or drop one here. It is read in your browser and never uploaded.
            </span>
          </div>

          {fileNote ? (
            <p role="status" className="text-xs text-lamp-live">
              {fileNote}
            </p>
          ) : null}

          <label className="block">
            <span className="sr-only">Outline text</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={14}
              placeholder={
                'Select the outline in your PDF reader, copy it, and paste it here.\n\n' +
                'The assessment table is the important part — the rest is a bonus.'
              }
              className="w-full rounded-[1px] border border-rack-600 bg-rack-900 px-3 py-2.5 font-mono text-xs leading-relaxed text-etch placeholder:text-etch-faint focus:border-lamp-live focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              onClick={read}
              disabled={text.trim().length < 20}
            >
              Read the outline
            </Button>
            <span className="text-xs text-etch-faint">
              Nothing is saved until you have reviewed what it found.
            </span>
          </div>
        </div>
      </section>
    );
  }

  const nothingFound =
    draft.assessments.length === 0 && draft.timetable.length === 0 && draft.sources.length === 0;

  return (
    <div className="space-y-8">
      {nothingFound ? (
        <section>
          <BayLabel>Nothing recognisable</BayLabel>
          <div className="border border-dashed border-rack-600 px-5 py-6">
            <p className="max-w-prose text-sm text-etch-dim">
              No assessment table was found in that text. Rather than invent one, here is what was
              pasted so you can check whether the table came across at all — outlines that are
              scanned images give no text to read.
            </p>
            <Button type="button" className="mt-4" onClick={() => setDraft(null)}>
              Try different text
            </Button>
          </div>
        </section>
      ) : null}

      <section>
        <BayLabel trailing={target ? `adding to ${target.code ?? target.name}` : 'new unit'}>
          Unit
        </BayLabel>

        {existingUnits.length > 0 ? (
          <div className="mb-3">
            <Field label="Import into">
              <Select
                value={targetUnitId === null ? 'new' : String(targetUnitId)}
                onChange={(event) =>
                  setTargetUnitId(event.target.value === 'new' ? null : Number(event.target.value))
                }
              >
                <option value="new">A new unit</option>
                {existingUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code ? `${unit.code} — ` : ''}
                    {unit.name} ({unit.assessmentCount} assessments)
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        {targetUnitId === null ? (
          <div className="grid gap-3 border border-rack-600 bg-rack-700/40 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Unit name" className="sm:col-span-2">
              <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} />
            </Field>
            <Field label="Code">
              <Input value={unitCode} onChange={(e) => setUnitCode(e.target.value)} />
            </Field>
            <Field label="Credit points">
              <Input
                type="number"
                step="any"
                min={0}
                value={creditPoints}
                onChange={(e) => setCreditPoints(e.target.value)}
              />
            </Field>
            <fieldset className="sm:col-span-2 lg:col-span-4">
              <legend className="mb-1.5 text-xs font-medium text-etch-dim">Plate colour</legend>
              <div className="flex flex-wrap gap-1.5">
                {UNIT_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setColor(option)}
                    aria-pressed={option === color}
                    aria-label={option}
                    className={[
                      unitPlateClass(option),
                      'h-7 w-9 rounded-[1px] transition-all',
                      option === color
                        ? 'ring-2 ring-etch ring-offset-2 ring-offset-rack-800'
                        : 'opacity-55 hover:opacity-100',
                    ].join(' ')}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
      </section>

      {draft.assessments.length > 0 ? (
        <section>
          <BayLabel
            trailing={`${chosen?.assessments.length ?? 0} of ${draft.assessments.length} · ${Math.round(weightTotal * 100) / 100}% of ${allowance}`}
          >
            Assessments
          </BayLabel>
          {draft.assessments.some((a) => a.isSubItem) ? (
            <p className="mb-2 max-w-prose text-xs text-etch-faint">
              Rows marked <span className="text-etch-dim">breakdown</span> are the itemised parts
              of a row above them — their weightings are already counted in the parent. They start
              switched off; tick them only if you want the detail instead of the summary.
            </p>
          ) : null}
          {overAllowance ? (
            <p className="mb-2 text-xs text-lamp-live">
              These weightings total more than the {allowance}% available
              {target ? ' on that unit' : ''}. The ones past the limit will be capped on import —
              untick some, or fix the figures afterwards.
            </p>
          ) : null}
          <ul className="rack-bay">
            {sortLowFirst(draft.assessments).map(({ row, index }) => (
              <li
                key={index}
                className={`strip ${keep[`a${index}`] ? '' : 'strip-pending opacity-60'} flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2`}
              >
                <Include
                  checked={keep[`a${index}`] ?? false}
                  label={`Import ${row.name}`}
                  onChange={(next) => setKeep((k) => ({ ...k, [`a${index}`]: next }))}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-strip-ink">{row.name}</span>
                    {row.isSubItem ? (
                      <span className="shrink-0 rounded-[1px] border border-strip-ink/40 px-1 py-px text-[0.625rem] text-strip-ink-soft">
                        breakdown
                      </span>
                    ) : null}
                  </span>
                  <Evidence row={row} />
                </span>
                <Figure className="text-xs text-strip-ink">{row.weighting}%</Figure>
                <Figure className="w-16 text-right text-xs text-strip-ink-soft">
                  / {row.maxMark}
                </Figure>
                <Figure className="w-24 text-right text-xs text-strip-ink-soft">
                  {row.dueDate ? formatShortDate(row.dueDate) : 'no date'}
                </Figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft.timetable.length > 0 ? (
        <section>
          <BayLabel trailing={`${chosen?.timetable.length ?? 0} of ${draft.timetable.length}`}>
            Class times
          </BayLabel>
          <ul className="rack-bay">
            {sortLowFirst(draft.timetable).map(({ row, index }) => (
              <li
                key={index}
                className={`strip ${keep[`t${index}`] ? '' : 'strip-pending opacity-60'} flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2`}
              >
                <Include
                  checked={keep[`t${index}`] ?? false}
                  label={`Import ${DAY_NAMES[row.dayOfWeek]} ${row.type}`}
                  onChange={(next) => setKeep((k) => ({ ...k, [`t${index}`]: next }))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium capitalize text-strip-ink">
                    {row.type} · {DAY_NAMES[row.dayOfWeek]}
                  </span>
                  <Evidence row={row} />
                </span>
                <Figure className="text-xs text-strip-ink">
                  {row.startTime}–{row.endTime}
                </Figure>
                <span className="w-40 truncate text-right text-xs text-strip-ink-soft">
                  {row.location ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft.sources.length > 0 ? (
        <section>
          <BayLabel trailing={`${chosen?.sources.length ?? 0} of ${draft.sources.length}`}>
            Readings
          </BayLabel>
          <p className="mb-2 max-w-prose text-xs text-etch-faint">
            Readings are the least reliable thing to pull out of pasted text, so these start
            switched off. Tick the ones that really are readings.
          </p>
          <ul className="rack-bay">
            {draft.sources.map((row, index) => (
              <li
                key={index}
                className={`strip ${keep[`s${index}`] ? '' : 'strip-pending opacity-60'} flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2`}
              >
                <Include
                  checked={keep[`s${index}`] ?? false}
                  label={`Import ${row.title}`}
                  onChange={(next) => setKeep((k) => ({ ...k, [`s${index}`]: next }))}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-strip-ink">{row.title}</span>
                {row.urlOrFileRef ? (
                  <span className="max-w-[14rem] truncate text-xs text-strip-ink-soft">
                    {row.urlOrFileRef}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {draft.unmatched.length > 0 ? (
        <section>
          <BayLabel trailing={`${draft.unmatched.length} lines`}>Not placed</BayLabel>
          <p className="mb-2 max-w-prose text-xs text-etch-faint">
            These lines were not recognised as anything. They are listed so nothing goes missing
            without you seeing it — if an assessment is in here, add it by hand afterwards.
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto border border-rack-600 bg-rack-900 p-3">
            {draft.unmatched.map((line, index) => (
              <li key={index} className="font-mono text-[0.6875rem] leading-relaxed text-etch-faint">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-rack-600 pt-4">
        <Button type="button" variant="primary" onClick={commit} disabled={pending || nothingFound}>
          {pending ? 'Importing…' : 'Import'}
        </Button>
        <Button type="button" onClick={() => setDraft(null)} disabled={pending}>
          Start over
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-lamp-over">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Low-confidence rows lead, so the ones needing a look are seen first. */
function sortLowFirst<T extends { confidence: string }>(rows: T[]): { row: T; index: number }[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => Number(a.row.confidence === 'high') - Number(b.row.confidence === 'high'));
}

/** The line a row was read from, and a flag when the reading was a guess. */
function Evidence({ row }: { row: { sourceLine: string; confidence: string } }) {
  return (
    <span className="mt-0.5 flex items-baseline gap-2">
      {row.confidence === 'low' ? (
        <span className="shrink-0 rounded-[1px] bg-strip-warn px-1 py-px text-[0.625rem] font-semibold text-strip">
          check
        </span>
      ) : null}
      <span className="truncate font-mono text-[0.625rem] text-strip-ink-soft">
        {row.sourceLine}
      </span>
    </span>
  );
}

function Include({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[1px] border transition-colors',
        checked
          ? 'border-strip-ink bg-strip-ink text-strip'
          : 'border-strip-ink/45 hover:border-strip-ink',
      ].join(' ')}
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden fill="none">
          <path
            d="M2.5 6.2l2.4 2.4L9.5 3.8"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}
