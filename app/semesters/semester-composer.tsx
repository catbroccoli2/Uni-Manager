'use client';

import { useActionState } from 'react';
import { createSemester } from './actions';
import { Button, Field, Input, Select } from '@/components/ui';
import type { ActionResult } from '@/lib/form';

/**
 * useActionState is the current App Router idiom for a form that posts to a
 * Server Action: React keeps the pending flag and the action's return value
 * without a separate useState, and the form still submits without JavaScript.
 */
async function submit(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  return createSemester(form);
}

export function SemesterComposer() {
  const [state, action, pending] = useActionState(submit, null);
  const thisYear = new Date().getFullYear();

  return (
    <form
      action={action}
      // key resets the uncontrolled inputs after a successful save, so the form
      // is ready for the next entry rather than holding the last one.
      key={state?.ok ? 'saved' : 'editing'}
      className="grid gap-3 border border-rack-600 bg-rack-700/40 p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <Field label="Name" className="sm:col-span-2 lg:col-span-2">
        <Input name="name" required placeholder={`Semester 1 ${thisYear}`} autoComplete="off" />
      </Field>

      <Field label="Year">
        <Input name="year" type="number" required defaultValue={thisYear} min={1900} max={2200} />
      </Field>

      <Field label="Starts" hint="Optional">
        <Input name="startDate" type="date" />
      </Field>

      <Field label="Ends" hint="Optional">
        <Input name="endDate" type="date" />
      </Field>

      <Field label="Status" className="sm:col-span-1">
        <Select name="status" defaultValue="upcoming">
          <option value="upcoming">Upcoming</option>
          <option value="current">Current</option>
          <option value="past">Archived</option>
        </Select>
      </Field>

      <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Adding…' : 'Add semester'}
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
