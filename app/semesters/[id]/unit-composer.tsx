'use client';

import { useActionState, useState } from 'react';
import { createUnit } from '@/app/units/actions';
import { Button, Field, Input } from '@/components/ui';
import { UNIT_COLORS, type UnitColor } from '@/db/schema';
import { unitPlateClass } from '@/components/unit-pill';
import type { ActionResult } from '@/lib/form';

async function submit(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return createUnit(form);
}

export function UnitComposer({ semesterId }: { semesterId: number }) {
  const [state, action, pending] = useActionState(submit, null);
  const [color, setColor] = useState<UnitColor>('violet');

  return (
    <form
      action={action}
      key={state?.ok ? 'saved' : 'editing'}
      className="grid gap-3 border border-rack-600 bg-rack-700/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input type="hidden" name="semesterId" value={semesterId} />
      <input type="hidden" name="color" value={color} />

      <Field label="Unit name" className="sm:col-span-2">
        <Input name="name" required placeholder="Business Digitilization" autoComplete="off" />
      </Field>

      <Field label="Code" hint="Optional">
        <Input name="code" placeholder="COMP1010" autoComplete="off" />
      </Field>

      <Field label="Credit points" hint="Only needed for WAM later">
        <Input name="creditPoints" type="number" step="any" min={0} placeholder="6" />
      </Field>

      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="mb-1.5 text-xs font-medium text-etch-dim">Plate colour</legend>
        <div className="flex flex-wrap gap-1.5">
          {UNIT_COLORS.map((option) => {
            const selected = option === color;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                aria-pressed={selected}
                aria-label={option}
                title={option}
                className={[
                  unitPlateClass(option),
                  'h-7 w-9 rounded-[1px] transition-all',
                  selected
                    ? 'ring-2 ring-etch ring-offset-2 ring-offset-rack-800'
                    : 'opacity-55 hover:opacity-100',
                ].join(' ')}
              />
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Adding…' : 'Add unit'}
        </Button>
        {state && !state.ok ? (
          <p role="alert" className="text-sm text-lamp-over">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
