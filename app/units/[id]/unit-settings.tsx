'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteUnit, updateUnit } from '@/app/units/actions';
import { Button, Field, Input } from '@/components/ui';
import { UNIT_COLORS, type UnitColor } from '@/db/schema';
import { unitPlateClass } from '@/components/unit-pill';
import type { UnitDetail } from '@/lib/queries';
import type { ActionResult } from '@/lib/form';

async function submit(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return updateUnit(form);
}

export function UnitSettings({ unit }: { unit: UnitDetail }) {
  const [state, action, pending] = useActionState(submit, null);
  const [color, setColor] = useState<UnitColor>(unit.color);
  const router = useRouter();

  async function remove() {
    const count = unit.assessments.length;
    const ok = window.confirm(
      count > 0
        ? `Delete "${unit.name}"? Its ${count} ${count === 1 ? 'assessment' : 'assessments'} will be deleted too. This cannot be undone.`
        : `Delete "${unit.name}"?`,
    );
    if (!ok) return;

    const form = new FormData();
    form.set('id', String(unit.id));
    await deleteUnit(form);
    router.push(`/semesters/${unit.semesterId}`);
  }

  return (
    <div className="space-y-3">
      <form
        action={action}
        className="grid gap-3 border border-rack-600 bg-rack-700/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input type="hidden" name="id" value={unit.id} />
        <input type="hidden" name="color" value={color} />

        <Field label="Unit name" className="sm:col-span-2">
          <Input name="name" required defaultValue={unit.name} autoComplete="off" />
        </Field>

        <Field label="Code" hint="Optional">
          <Input name="code" defaultValue={unit.code ?? ''} autoComplete="off" />
        </Field>

        <Field label="Credit points" hint="Only needed for WAM later">
          <Input
            name="creditPoints"
            type="number"
            step="any"
            min={0}
            defaultValue={unit.creditPoints ?? ''}
          />
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
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
          {state?.ok ? <span className="text-sm text-lamp-clear">Saved.</span> : null}
          {state && !state.ok ? (
            <p role="alert" className="text-sm text-lamp-over">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>

      <div className="flex justify-end">
        <Button type="button" variant="danger" onClick={remove}>
          Delete unit
        </Button>
      </div>
    </div>
  );
}
