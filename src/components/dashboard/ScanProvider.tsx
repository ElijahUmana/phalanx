'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from 'react';
import type { PhalanxEvent } from '@/lib/events/types';
import { useSSE } from '@/hooks/useSSE';

export type ScanStatus =
  | 'idle'
  | 'connecting'
  | 'scanning'
  | 'complete'
  | 'failed';

export interface Package {
  name: string;
  version: string;
  registry: string;
}

export interface Cve {
  cveId: string;
  packageName: string;
  severity: string;
  description: string;
  sourceUrl?: string;
}

export type ForkStatus =
  | 'forking'
  | 'provisioning'
  | 'validating'
  | 'cancelled'
  | 'complete';

export interface Fork {
  forkId: string;
  hypothesis: { name: string; strategy: string };
  cveId: string;
  status: ForkStatus;
  startedAt: number;
  completedAt?: number;
  backendUrl?: string;
  score?: number;
  testsPassed?: number;
  testsTotal?: number;
}

export interface Evidence {
  winningForkId?: string;
  sbomHash?: string;
  sigstoreUrl?: string;
  slsaLevel?: number;
  txHash?: string;
  explorerUrl?: string;
  prUrl?: string;
  citedMdUrl?: string;
  evidenceHash?: string;
  beforeImage?: string;
  afterImage?: string;
}

export interface ScanState {
  status: ScanStatus;
  scanId: string | null;
  repoUrl: string | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  events: PhalanxEvent[];
  deps: { totalPackages: number; packages: Package[] } | null;
  cves: Cve[];
  forks: Fork[];
  cancelFlash: { reason: string; at: number } | null;
  evidence: Evidence;
  error: string | null;
}

const initialState: ScanState = {
  status: 'idle',
  scanId: null,
  repoUrl: null,
  startedAt: null,
  completedAt: null,
  durationMs: null,
  events: [],
  deps: null,
  cves: [],
  forks: [],
  cancelFlash: null,
  evidence: {},
  error: null,
};

type Action =
  | {
      kind: 'START_REQUESTED';
      scanId: string;
      repoUrl: string;
    }
  | { kind: 'EVENT'; event: PhalanxEvent }
  | { kind: 'CONNECTION_ERROR'; error: string }
  | { kind: 'RESET' };

function getString(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key];
  return typeof v === 'string' ? v : undefined;
}
function getNumber(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key];
  return typeof v === 'number' ? v : undefined;
}
function getObject(
  data: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const v = data[key];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

function applyEvent(state: ScanState, event: PhalanxEvent): ScanState {
  const nextEvents = [...state.events, event];
  const d = event.data;

  switch (event.type) {
    case 'scan.started':
      return {
        ...state,
        events: nextEvents,
        status: 'scanning',
        startedAt: event.timestamp,
      };

    case 'deps.parsed': {
      const totalPackages = getNumber(d, 'totalPackages') ?? 0;
      const rawPkgs = d.packages;
      const packages: Package[] = Array.isArray(rawPkgs)
        ? rawPkgs.map((p): Package => {
            const pp = p as Record<string, unknown>;
            return {
              name: getString(pp, 'name') ?? 'unknown',
              version: getString(pp, 'version') ?? '?',
              registry: getString(pp, 'registry') ?? 'npm',
            };
          })
        : [];
      return {
        ...state,
        events: nextEvents,
        deps: { totalPackages, packages },
      };
    }

    case 'cve.found': {
      const cve: Cve = {
        cveId: getString(d, 'cveId') ?? 'UNKNOWN',
        packageName: getString(d, 'packageName') ?? 'unknown',
        severity: getString(d, 'severity') ?? 'UNKNOWN',
        description: getString(d, 'description') ?? '',
        sourceUrl: getString(d, 'sourceUrl'),
      };
      return {
        ...state,
        events: nextEvents,
        cves: [...state.cves, cve],
      };
    }

    case 'ghost.fork.started': {
      const forkId = getString(d, 'forkId');
      if (!forkId) return { ...state, events: nextEvents };
      const hypObj = getObject(d, 'hypothesis') ?? {};
      const fork: Fork = {
        forkId,
        hypothesis: {
          name: getString(hypObj, 'name') ?? forkId,
          strategy: getString(hypObj, 'strategy') ?? '',
        },
        cveId: getString(d, 'cveId') ?? '',
        status: 'forking',
        startedAt: event.timestamp,
      };
      return {
        ...state,
        events: nextEvents,
        forks: [...state.forks, fork],
      };
    }

    case 'ghost.fork.complete': {
      const forkId = getString(d, 'forkId');
      return {
        ...state,
        events: nextEvents,
        forks: state.forks.map((f) =>
          f.forkId === forkId
            ? { ...f, status: 'provisioning', completedAt: event.timestamp }
            : f,
        ),
      };
    }

    case 'insforge.provision': {
      const forkId = getString(d, 'forkId');
      const url = getString(d, 'url');
      return {
        ...state,
        events: nextEvents,
        forks: state.forks.map((f) =>
          f.forkId === forkId ? { ...f, status: 'validating', backendUrl: url } : f,
        ),
      };
    }

    case 'insforge.validate': {
      const backendId = getString(d, 'backendId') ?? '';
      const score = getNumber(d, 'score');
      const testsPassed = getNumber(d, 'testsPassed');
      const testsTotal = getNumber(d, 'testsTotal');
      return {
        ...state,
        events: nextEvents,
        forks: state.forks.map((f) =>
          backendId.endsWith(f.forkId)
            ? { ...f, status: 'complete', score, testsPassed, testsTotal }
            : f,
        ),
      };
    }

    case 'hypothesis.cancelled': {
      const forkId = getString(d, 'forkId');
      return {
        ...state,
        events: nextEvents,
        forks: state.forks.map((f) =>
          f.forkId === forkId ? { ...f, status: 'cancelled' } : f,
        ),
      };
    }

    case 'redis.pubsub.cancel': {
      return {
        ...state,
        events: nextEvents,
        cancelFlash: {
          reason: getString(d, 'reason') ?? 'cancelled',
          at: event.timestamp,
        },
      };
    }

    case 'chainguard.dfc.convert': {
      return {
        ...state,
        events: nextEvents,
        evidence: {
          ...state.evidence,
          beforeImage: getString(d, 'beforeImage'),
          afterImage: getString(d, 'afterImage'),
        },
      };
    }

    case 'chainguard.sbom': {
      return {
        ...state,
        events: nextEvents,
        evidence: {
          ...state.evidence,
          sbomHash: getString(d, 'imageHash'),
          sigstoreUrl: getString(d, 'sigstoreUrl'),
          slsaLevel: getNumber(d, 'slsaLevel'),
        },
      };
    }

    case 'x402.payment': {
      return {
        ...state,
        events: nextEvents,
        evidence: {
          ...state.evidence,
          txHash: getString(d, 'txHash'),
          explorerUrl: getString(d, 'explorerUrl'),
        },
      };
    }

    case 'tinyfish.pr.created': {
      return {
        ...state,
        events: nextEvents,
        evidence: { ...state.evidence, prUrl: getString(d, 'prUrl') },
      };
    }

    case 'senso.published': {
      return {
        ...state,
        events: nextEvents,
        evidence: {
          ...state.evidence,
          citedMdUrl: getString(d, 'citedMdUrl'),
          evidenceHash: getString(d, 'evidenceHash'),
        },
      };
    }

    case 'scan.complete': {
      return {
        ...state,
        events: nextEvents,
        status: 'complete',
        completedAt: event.timestamp,
        durationMs: getNumber(d, 'durationMs') ?? null,
        evidence: {
          ...state.evidence,
          winningForkId: getString(d, 'winningForkId'),
          citedMdUrl:
            state.evidence.citedMdUrl ?? getString(d, 'evidenceUrl'),
        },
      };
    }

    case 'scan.failed': {
      return {
        ...state,
        events: nextEvents,
        status: 'failed',
        error: getString(d, 'error') ?? 'Unknown error',
      };
    }

    default:
      return { ...state, events: nextEvents };
  }
}

function reducer(state: ScanState, action: Action): ScanState {
  switch (action.kind) {
    case 'START_REQUESTED':
      return {
        ...initialState,
        status: 'connecting',
        scanId: action.scanId,
        repoUrl: action.repoUrl,
      };
    case 'EVENT':
      return applyEvent(state, action.event);
    case 'CONNECTION_ERROR':
      return { ...state, status: 'failed', error: action.error };
    case 'RESET':
      return initialState;
  }
}

interface ScanContextValue {
  state: ScanState;
  startScan: (repoUrl: string) => Promise<void>;
  reset: () => void;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useSSE({
    scanId: state.status === 'idle' ? null : state.scanId,
    onEvent: useCallback((event: PhalanxEvent) => {
      dispatch({ kind: 'EVENT', event });
    }, []),
    onError: useCallback((error: string) => {
      dispatch({ kind: 'CONNECTION_ERROR', error });
    }, []),
  });

  const startScan = useCallback(async (repoUrl: string) => {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown error' }));
      throw new Error(
        typeof err.error === 'string' ? err.error : 'Scan request failed',
      );
    }
    const { scanId } = (await res.json()) as { scanId: string };
    dispatch({ kind: 'START_REQUESTED', scanId, repoUrl });
  }, []);

  const reset = useCallback(() => dispatch({ kind: 'RESET' }), []);

  const value = useMemo(
    () => ({ state, startScan, reset }),
    [state, startScan, reset],
  );

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) {
    throw new Error('useScan must be used inside <ScanProvider>');
  }
  return ctx;
}

export function useEventsBySource(source: PhalanxEvent['source']): PhalanxEvent[] {
  const { state } = useScan();
  return useMemo(
    () => state.events.filter((e) => e.source === source),
    [state.events, source],
  );
}
