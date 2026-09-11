'use client';

import { useRef, useState, type RefObject } from 'react';
import { ASSESSMENT_TYPES, type Assessment, type AssessmentType } from '@/db/schema';
import { describeDueDate, dueUrgency } from '@/lib/dates';
import { Button } from '@/components/ui';
import type { Patchable } from '@/components/unit-workspace';

/**
 * The rack: one buff strip per assessment.
 *
 * Editing model, confirmed with the user: every cell is always live. Type, then
 * leave the field or press Enter and it saves. Escape reverts the cell. There
 * is no save button anywhere, because the Notion table this replaces does not
 * have one and PRD.md §6.2 measures this against that table.
 *
 * State and mutations live in UnitWorkspace, not here, because the grade gauge
 * has to read the same optimistic rows — typing a mark must move the gauge on
 * the same keystroke.
 *
 * A deliberate departure from the direction contract, which called for separate
 * CLEARED and PENDING bays: strips stay in one bay in outline order, because
 * moving a row the instant it is ticked fights the fast-entry flow §6.2 puts
 * first. The distinction is carried by the stock instead — clean buff is
 * written on, hatched is blank — so a strip's material states its bay.
 */
export function AssessmentRack({
  rows,
  pending,
  error,
  focusOnMount,
  onSave,
  onAdd,
  onRemove,
}: {
  rows: Assessment[];
  pending: boolean;
  error: string | null;
  focusOnMount: RefObject<number | null>;
  onSave: (id: number, patch: Patchable) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
}) {
  const totalWeighting = rows.reduce((sum, row) => sum + row.weighting, 0);

  return (
    <div className="space-y-2">
      <RackLegend count={rows.length} totalWeighting={Math.round(totalWeighting * 100) / 100} />

      {rows.length === 0 ? (
        <div className="border border-dashed border-rack-600 px-5 py-8 text-center">
          <p className="text-sm text-etch-dim">
            No assessments on this rack yet. Add the first one from the unit outline.
          </p>
          <div className="mt-3.5 flex justify-center">
            <Button type="button" variant="primary" onClick={onAdd} disabled={pending}>
              Add a strip
            </Button>
          </div>
        </div>
      ) : (
        <ul className="rack-bay">
          {rows.map((row) => (
            <Strip
              key={row.id}
              row={row}
              onSave={onSave}
              onDelete={onRemove}
              onAppend={onAdd}
              autoFocus={focusOnMount.current === row.id}
              onFocused={() => {
                focusOnMount.current = null;
              }}
            />
          ))}
        </ul>
      )}

      {rows.length > 0 ? (
        <div className="flex items-center gap-3 pt-1">
          <Button type="button" onClick={onAdd} disabled={pending}>
            Add a strip
          </Button>
          <span className="text-xs text-etch-faint">
            Enter on the last field adds the next strip.
          </span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-lamp-over">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Column headings, stencilled on the rack above the bays. */
function RackLegend({ count, totalWeighting }: { count: number; totalWeighting: number }) {
  if (count === 0) return null;
  const off = Math.abs(totalWeighting - 100) > 0.001;
  return (
    <div
      aria-hidden
      className="hidden items-center gap-3 px-3 text-[0.6875rem] font-medium text-etch-faint lg:grid lg:grid-cols-[1.75rem_minmax(0,1fr)_7rem_6.5rem_4.5rem_4.5rem_3.5rem_1.75rem]"
    >
      {/*
        Empty spacer spans, not `sr-only` ones. `sr-only` is position:absolute,
        which takes the element out of grid flow entirely — every following
        heading then shifts a column left and lands on top of its neighbour.
        The whole strip is aria-hidden because each cell already carries its own
        aria-label; a screen reader does not need the visual column guide.
      */}
      <span />
      <span>Assessment</span>
      <span>Due</span>
      <span>Type</span>
      <span className={off ? 'text-lamp-live' : undefined}>
        Weight{off ? ` (${totalWeighting})` : ''}
      </span>
      <span>Mark</span>
      <span className="text-right">Raw</span>
      <span />
    </div>
  );
}

function Strip({
  row,
  onSave,
  onDelete,
  onAppend,
  autoFocus,
  onFocused,
}: {
  row: Assessment;
  onSave: (id: number, patch: Patchable) => void;
  onDelete: (id: number) => void;
  onAppend: () => void;
  autoFocus: boolean;
  onFocused: () => void;
}) {
  const graded = row.completed;
  const rawPercent =
    row.completed && row.mark !== null && row.weighting > 0
      ? Math.round((row.mark / row.weighting) * 1000) / 10
      : null;

  const urgency = row.dueDate && !row.completed ? dueUrgency(row.dueDate) : null;

  return (
    <li
      className={[
        'strip relative grid items-center gap-x-3 gap-y-2 px-3 py-2',
        'grid-cols-[1.75rem_minmax(0,1fr)_1.75rem]',
        'lg:grid-cols-[1.75rem_minmax(0,1fr)_7rem_6.5rem_4.5rem_4.5rem_3.5rem_1.75rem] lg:gap-y-0',
        graded ? '' : 'strip-pending',
      ].join(' ')}
    >
      {/*
        Weighting as magnitude: the strip's own extent, drawn along its foot.
        Keeping it on the edge rather than varying the row's width means a
        40-weight strip reads as heavier than a 7.5 one without the editable
        columns falling out of alignment.
      */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-strip-ink/15"
      >
        <span
          className="block h-full bg-strip-ink/55"
          style={{ width: `${Math.max(0, Math.min(row.weighting, 100))}%` }}
        />
      </span>

      <Tick
        checked={graded}
        label={`Mark ${row.name || 'this assessment'} as graded`}
        onChange={(completed) => onSave(row.id, { completed })}
      />

      <CellText
        value={row.name}
        placeholder="Assessment name"
        ariaLabel="Assessment name"
        className="font-medium"
        autoFocus={autoFocus}
        onFocused={onFocused}
        onCommit={(name) => onSave(row.id, { name })}
      />

      <div className="col-span-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 lg:contents">
        <label className="flex flex-col gap-0.5 lg:contents">
          <span className="text-[0.625rem] text-strip-ink-soft lg:hidden">Due</span>
          <span className="lg:block">
            <CellDate
              value={row.dueDate}
              onCommit={(dueDate) => onSave(row.id, { dueDate })}
            />
            {urgency && row.dueDate ? (
              <span
                className={[
                  'mt-0.5 block text-[0.625rem] leading-tight',
                  urgency === 'overdue'
                    ? 'font-semibold text-strip-alert'
                    : urgency === 'today' || urgency === 'soon'
                      ? 'font-medium text-strip-warn'
                      : 'text-strip-ink-soft',
                ].join(' ')}
              >
                {describeDueDate(row.dueDate)}
              </span>
            ) : null}
          </span>
        </label>

        <label className="flex flex-col gap-0.5 lg:contents">
          <span className="text-[0.625rem] text-strip-ink-soft lg:hidden">Type</span>
          <CellSelect
            value={row.type}
            onCommit={(type) => onSave(row.id, { type: type as AssessmentType })}
          />
        </label>

        <label className="flex flex-col gap-0.5 lg:contents">
          <span className="text-[0.625rem] text-strip-ink-soft lg:hidden">Weight</span>
          <CellNumber
            value={row.weighting}
            ariaLabel="Weighting"
            min={0}
            onCommit={(weighting) => onSave(row.id, { weighting: weighting ?? 0 })}
          />
        </label>

        <label className="flex flex-col gap-0.5 lg:contents">
          <span className="text-[0.625rem] text-strip-ink-soft lg:hidden">Mark</span>
          <CellNumber
            value={row.mark}
            ariaLabel="Mark, in weighted points"
            placeholder="—"
            min={0}
            onCommit={(mark) => onSave(row.id, { mark })}
            onEnterOnLast={onAppend}
          />
        </label>

        <span className="hidden text-right font-mono text-xs tabular-nums text-strip-ink-soft lg:block">
          {rawPercent === null ? '' : `${rawPercent}%`}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onDelete(row.id)}
        aria-label={`Remove ${row.name || 'this assessment'}`}
        title="Remove"
        className="justify-self-end rounded-[1px] p-1 text-strip-ink-soft transition-colors hover:bg-lamp-over hover:text-rack-900"
      >
        <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden fill="none">
          <path
            d="M3 3l8 8M11 3l-8 8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </li>
  );
}

/** The graded box. A drawn tick, not a Unicode glyph or a native checkbox. */
function Tick({
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
        'flex h-[18px] w-[18px] items-center justify-center rounded-[1px] border transition-colors',
        checked
          ? 'border-strip-ink bg-strip-ink text-strip'
          : 'border-strip-ink/45 bg-transparent hover:border-strip-ink',
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

const CELL =
  'w-full rounded-[1px] border border-transparent bg-transparent px-1.5 py-1 text-sm ' +
  'text-strip-ink placeholder:text-strip-ink-soft/70 ' +
  'hover:border-strip-ink/25 focus:border-strip-ink/60 focus:bg-strip/60 focus:outline-none';

/**
 * A text cell. Holds its own draft while focused so the field does not fight
 * the optimistic value mid-keystroke, then commits on blur or Enter. Escape
 * restores the value the cell was given.
 */
function CellText({
  value,
  placeholder,
  ariaLabel,
  className = '',
  autoFocus,
  onFocused,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  autoFocus?: boolean;
  onFocused?: () => void;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // A ref, not state: Escape has to blur the field, and blur fires synchronously
  // while a setState is still queued. Reading state here would see the stale
  // draft and commit exactly the value Escape was meant to discard.
  const escaping = useRef(false);
  const shown = draft ?? value;

  return (
    <input
      type="text"
      value={shown}
      aria-label={ariaLabel}
      placeholder={placeholder}
      autoComplete="off"
      ref={(node) => {
        if (node && autoFocus) {
          node.focus();
          onFocused?.();
        }
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (escaping.current) {
          escaping.current = false;
        } else if (draft !== null && draft !== value) {
          onCommit(draft);
        }
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          escaping.current = true;
          event.currentTarget.blur();
        }
      }}
      className={`${CELL} ${className}`}
    />
  );
}

function CellNumber({
  value,
  ariaLabel,
  placeholder,
  min,
  onCommit,
  onEnterOnLast,
}: {
  value: number | null;
  ariaLabel: string;
  placeholder?: string;
  min?: number;
  onCommit: (next: number | null) => void;
  onEnterOnLast?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // See the note in CellText: blur runs before a queued setState is visible.
  const escaping = useRef(false);
  const shown = draft ?? (value === null ? '' : String(value));

  function commit(text: string) {
    const trimmed = text.trim();
    // Blank is not zero. For `mark` it means "not graded yet", and coercing it
    // to 0 would tell the calculator the student scored nothing.
    onCommit(trimmed === '' ? null : Number(trimmed));
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      min={min}
      value={shown}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (escaping.current) {
          escaping.current = false;
        } else if (draft !== null) {
          commit(draft);
        }
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
          onEnterOnLast?.();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          escaping.current = true;
          event.currentTarget.blur();
        }
      }}
      className={`${CELL} text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
    />
  );
}

function CellDate({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (next: string | null) => void;
}) {
  return (
    <input
      type="date"
      defaultValue={value ?? ''}
      aria-label="Due date"
      onChange={(event) => onCommit(event.target.value === '' ? null : event.target.value)}
      className={`${CELL} font-mono text-xs tabular-nums [color-scheme:light]`}
    />
  );
}

const TYPE_LABEL: Record<AssessmentType, string> = {
  individual: 'Individual',
  group: 'Group',
  'team-based': 'Team-based',
};

function CellSelect({
  value,
  onCommit,
}: {
  value: AssessmentType;
  onCommit: (next: string) => void;
}) {
  return (
    <select
      value={value}
      aria-label="Assessment type"
      onChange={(event) => onCommit(event.target.value)}
      className={`${CELL} text-xs`}
    >
      {ASSESSMENT_TYPES.map((type) => (
        <option key={type} value={type}>
          {TYPE_LABEL[type]}
        </option>
      ))}
    </select>
  );
}
