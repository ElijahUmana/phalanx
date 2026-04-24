import { CancelEvent } from '@/components/dashboard/CancelEvent';
import { EvidenceChain } from '@/components/dashboard/EvidenceChain';
import { Hero } from '@/components/dashboard/Hero';
import { PanelGrid } from '@/components/dashboard/PanelGrid';
import { ScanInput } from '@/components/dashboard/ScanInput';
import { ScanProvider } from '@/components/dashboard/ScanProvider';

export default function DashboardPage() {
  return (
    <ScanProvider>
      <main className="flex min-h-screen flex-col bg-zinc-950 p-6 lg:p-8">
        <Hero />

        <section className="mt-5">
          <ScanInput />
        </section>

        <section className="mt-5 flex-1">
          <PanelGrid />
        </section>

        <section className="mt-5">
          <EvidenceChain />
        </section>

        <CancelEvent />

        <footer className="mt-6 border-t border-zinc-900 pt-4 font-mono text-[10px] text-zinc-600">
          Phalanx · 8 tools · parallel speculative remediation · cryptographic
          provenance ·{' '}
          <a
            href="https://github.com/ElijahUmana/phalanx"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-400"
          >
            source
          </a>
        </footer>
      </main>
    </ScanProvider>
  );
}
