import type { Metadata } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { RackHeader } from '@/components/rack-header';

/*
  Archivo carries the stencilled-label register the rack needs and holds up at
  the gauge's size without a second display face. JetBrains Mono appears only
  where a figure is being measured or compared — marks, weightings, the needed
  average — never as a costume for "technical".

  next/font self-hosts both at build time, so nothing here reaches the network
  at runtime. That matters: CLAUDE.md rules out external network calls.
*/
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-mono-face',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Uni Manager',
  description: 'Semesters, units, assessments and grades, tracked locally.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <RackHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
