import { listGradeBands } from '@/lib/queries';
import { BayLabel } from '@/components/ui';
import { BandEditor } from './band-editor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const bands = await listGradeBands();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-prose text-sm text-etch-dim">
          Grade bands and data export.
        </p>
      </div>

      <section>
        <BayLabel trailing="Australian defaults">Grade bands</BayLabel>
        <p className="mb-3 max-w-prose text-sm text-etch-dim">
          Only each band&rsquo;s floor is editable. Its ceiling is derived from the band above, so a
          score can never fall between two bands or match both.
        </p>
        <BandEditor bands={bands} />
      </section>
    </div>
  );
}
