'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>(
    { kind: 'idle' },
  );

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets the same file be picked again
    if (!file) return;

    const sure = window.confirm(
      'Importing replaces EVERYTHING on this device (semesters, units, grades, timetable, grade bands) with the contents of the file. Continue?',
    );
    if (!sure) return;

    setStatus({ kind: 'busy' });
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await file.text(),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Import failed.');
      setStatus({
        kind: 'ok',
        message: `Imported ${result.counts.semesters} semesters, ${result.counts.units} units, ${result.counts.assessments} assessments.`,
      });
      router.refresh();
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Import failed.' });
    }
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
      <button
        type="button"
        disabled={status.kind === 'busy'}
        onClick={() => input.current?.click()}
        className="rounded-[1px] bg-rack-700 px-3 py-1.5 text-sm text-etch-dim transition-colors hover:bg-rack-600 hover:text-etch disabled:opacity-50"
      >
        {status.kind === 'busy' ? 'Importing…' : 'Import everything'}
      </button>
      {status.message ? (
        <p className={`text-xs ${status.kind === 'error' ? 'text-strip-alert' : 'text-etch-dim'}`}>
          {status.message}
        </p>
      ) : null}
    </div>
  );
}