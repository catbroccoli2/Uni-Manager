import { listGradeBands } from '@/lib/queries';
import { resolveDatabasePath } from '@/lib/db/path';
import { BayLabel } from '@/components/ui';
import { BandEditor } from './band-editor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const bands = await listGradeBands();
  // Read on the server and rendered as text. Knowing where the file actually
  // lives is the point of a local-first app, and it is easy to forget once the
  // default moved out of the repo.
  const dbLocationHint = resolveDatabasePath();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-prose text-sm text-etch-dim">
          Grade bands, GPA scale, and data export.
        </p>
      </div>

      <section>
        <BayLabel trailing="Australian defaults">Grade bands</BayLabel>
        <p className="mb-3 max-w-prose text-sm text-etch-dim">
          Only each band&rsquo;s floor is editable. Its ceiling is derived from the band above, so a
          score can never fall between two bands or match both. Grade points set the GPA scale.
        </p>
        <BandEditor bands={bands} />
      </section>

      <section>
        <BayLabel>Export</BayLabel>
        <div className="flex flex-wrap items-center gap-4 border border-rack-600 bg-rack-700/40 px-4 py-4">
          <div className="min-w-0 flex-1">
            <p className="max-w-prose text-sm text-etch-dim">
              Downloads every semester, unit, assessment, content source, timetable entry and grade
              band as one JSON file.
            </p>
            <p className="mt-1 text-xs text-etch-faint">
              The database itself lives at{' '}
              <code className="font-mono text-etch-dim">{dbLocationHint}</code>, outside this
              project folder.
            </p>
          </div>
          {/*
            A plain link, not a fetch-and-blob dance: the route already sets
            Content-Disposition, so the browser handles the save itself and the
            page needs no JavaScript for this at all.
          */}
          <a
            href="/api/export"
            download
            className="shrink-0 rounded-[1px] bg-strip px-3 py-1.5 text-sm font-medium text-strip-ink transition-colors hover:bg-[#e3dac7]"
          >
            Export everything
          </a>
        </div>
      </section>
    </div>
  );
}
