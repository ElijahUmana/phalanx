# Phalanx

**Parallel-fork CVE response fabric.** An autonomous agent fleet that detects critical CVEs, forks dependency state into N parallel remediation hypotheses via Ghost zero-copy forking, coordinates agents via Redis Streams/Pub/Sub, validates each in an isolated InsForge backend, cancels false positives mid-flight, and ships the winner with cryptographic provenance.

## Why this is structurally different from Snyk Agent Fix

Snyk does *single-hypothesis* auto-patch via API. Phalanx is *N-hypothesis parallel speculation* with live validation, mid-flight cancellation on false positives, autonomous web-action patch procurement, bidirectional customer integration, and a cryptographically-signed evidence chain. Not faster Snyk — a structurally different shape of work that requires eight sponsor primitives, each load-bearing.

## Live dashboard

Paste a GitHub repo URL into `/dashboard`. The scan runs end-to-end in the browser over Server-Sent Events:

| Phase | What you see |
|-------|--------------|
| Audit | deps parsed, CVE found, TinyFish enriches from vendor advisories |
| Analysis | Redis Vector Sets matches similar historical CVEs, Streams dispatch analyst agents, WunderGraph blocks over-scoped queries |
| Speculation | N Ghost forks race, InsForge backends provision in parallel, one lane cancels mid-flight via Redis Pub/Sub |
| Baseline | Chainguard DFC converts to zero-CVE image, SBOM signed with Sigstore |
| Publication | TinyFish creates a remediation PR, x402 micropayment on Base Sepolia, Senso publishes to `cited.md` |

The dashboard is a thin renderer over a typed event stream. Every `src/lib/*` module emits `PhalanxEvent` via a shared `emitEvent(scanId, event)` helper to Redis Pub/Sub channel `scan:events:{scanId}`. The SSE route at `/api/status?scanId=…` forwards each frame to the browser.

## Development

```bash
pnpm install
cp .env.example .env.local   # fill in API keys; REDIS_URL is pre-populated
pnpm dev                     # http://localhost:3000  → redirects to /dashboard
```

### Try a scan locally

```bash
SCAN=$(curl -s -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"https://github.com/ElijahUmana/phalanx"}' | jq -r .scanId)

curl -N "http://localhost:3000/api/status?scanId=$SCAN"
```

## Integration smoke tests

Each data-layer subsystem ships with an end-to-end script that hits real infrastructure (Ghost Cloud + Redis Cloud). Tests exit non-zero on any failure.

```bash
pnpm tsx scripts/seed-ghost.ts   # one-time: create phalanx-deps, seed real npm data
pnpm tsx scripts/test-ghost.ts   # fork, query, write, verify, delete
pnpm tsx scripts/test-redis.ts   # streams + pubsub + vector sets + semantic cache
```

## Subsystem owners

| Dir | Owner task | What it does |
|-----|-----------|--------------|
| `src/lib/ghost/`       | #3  | Zero-copy fork of dependency-state DB + pgvector Memory Engine |
| `src/lib/redis/`       | #4  | Streams (task distribution) + Pub/Sub (cancellation) + Vector Sets (similarity) + semantic cache |
| `src/lib/wundergraph/` | #2  | Federated supergraph + MCP Gateway w/ per-tool OAuth scopes |
| `src/lib/tinyfish/`    | #5  | CVE enrichment + vendor portal nav + GitHub PR creation |
| `src/lib/insforge/`    | #6  | Per-hypothesis staging backends via MCP |
| `src/lib/x402/`        | #7  | USDC micropayments on Base + CDP wallet + agentic.market |
| `src/lib/guild/`       | #8  | 5-agent orchestration with approval gates + audit log |
| `src/lib/chainguard/`  | #9  | Zero-CVE base images + DFC conversion + Sigstore SBOM |
| `src/lib/nexla/`       | #10 | Bidirectional data pipelines for SBOM ingestion and remediation distribution |
| `src/lib/senso/`       | #11 | cited.md evidence package publication |
| `src/lib/events/`      | #12 | Shared event bus + typed `PhalanxEvent` contract every module publishes to |
| `src/lib/scan/`        | #12 | Scan orchestrator (wires every lib/* module in sequence) |
| `src/app/api/`         | #12 | `POST /api/scan` + `GET /api/status` SSE stream |
| `src/app/dashboard/`   | #12 | Real-time visualization dashboard |

## Event contract (cross-module)

Every `lib/*` module imports `emitEvent` and publishes typed events:

```ts
import { emitEvent } from '@/lib/events/emitter';

await emitEvent(scanId, {
  type: 'ghost.fork.started',
  source: 'ghost',
  data: { forkId, hypothesis, cveId, parentDb: 'phalanx-deps' },
});
```

The canonical event types are documented in `src/lib/events/types.ts`. The dashboard subscribes to the same channel and routes events to source-specific panels automatically.

## Container build

Chainguard zero-CVE base images for both builder and runtime.

```bash
docker build -t phalanx .
docker run -p 3000:3000 --env-file .env.local phalanx
```

## Deployment

Phalanx deploys to Vercel as a Next.js app. API routes run on Node with `maxDuration = 300s` for the SSE stream.

```bash
vercel link
vercel env pull
vercel deploy --prod
```

All env vars from `.env.example` must be set in the Vercel project dashboard. Redis Cloud, Ghost Cloud, and Chainguard registry access must be reachable from Vercel Functions.

## Install as a skill

Phalanx is published as a [shipables](https://agentskills.io) skill so other AI agents can run on-demand CVE scans end-to-end:

```bash
npx shipables install ElijahUmana/phalanx
```

Skill page: [codeables.dev/skills/ElijahUmana/phalanx](https://codeables.dev/skills/ElijahUmana/phalanx). Definition in `skills/phalanx/SKILL.md`.

## Live demo

- Dashboard: [phalanx-sandy.vercel.app/dashboard](https://phalanx-sandy.vercel.app/dashboard)
- `POST /api/scan` + SSE `/api/status?scanId=…` — verified end-to-end on Vercel (52 events across 24 types per scan, `scan.complete` fires in ~50s against a public GitHub repo).

## License

Hackathon submission. All rights reserved pending license selection.
