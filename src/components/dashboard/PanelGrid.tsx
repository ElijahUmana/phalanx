'use client';

import { AgentFeed } from './AgentFeed';
import { ChainguardPanel } from './ChainguardPanel';
import { ForkRace } from './ForkRace';
import { GhostPanel } from './GhostPanel';
import { InsForgePanel } from './InsForgePanel';
import { NexlaPanel } from './NexlaPanel';
import { RedisPanel } from './RedisPanel';
import { TinyFishPanel } from './TinyFishPanel';
import { WunderGraphPanel } from './WunderGraphPanel';
import { X402Panel } from './X402Panel';

export function PanelGrid() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(220px,1fr)]">
      {/* Row 1 — the headliners */}
      <div className="lg:col-span-5 lg:row-span-2">
        <ForkRace />
      </div>
      <div className="lg:col-span-4">
        <GhostPanel />
      </div>
      <div className="lg:col-span-3 lg:row-span-3">
        <AgentFeed />
      </div>

      {/* Row 2 */}
      <div className="lg:col-span-4">
        <RedisPanel />
      </div>

      {/* Row 3 */}
      <div className="lg:col-span-5">
        <InsForgePanel />
      </div>
      <div className="lg:col-span-4">
        <TinyFishPanel />
      </div>

      {/* Row 4 */}
      <div className="lg:col-span-3">
        <WunderGraphPanel />
      </div>
      <div className="lg:col-span-3">
        <ChainguardPanel />
      </div>
      <div className="lg:col-span-3">
        <NexlaPanel />
      </div>
      <div className="lg:col-span-3">
        <X402Panel />
      </div>
    </div>
  );
}
