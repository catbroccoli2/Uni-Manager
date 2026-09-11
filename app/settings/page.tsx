import { BayLabel, EmptyBay } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-prose text-sm text-etch-dim">
          Grade bands and data export.
        </p>
      </div>

      <section>
        <BayLabel>Grade bands</BayLabel>
        <EmptyBay>Editable bands land with the grade calculator.</EmptyBay>
      </section>
    </div>
  );
}
