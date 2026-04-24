# Phalanx

Parallel-fork CVE response fabric. An autonomous agent fleet that detects critical CVEs, forks dependency state into N parallel remediation hypotheses via Ghost zero-copy forking, coordinates agents via Redis Streams/Pub/Sub, validates each in an isolated InsForge backend, cancels false positives mid-flight, and ships the winner with cryptographic provenance.

See `../FINAL-CONCEPT.md` for the full concept brief.

## Development

```bash
pnpm install
cp .env.example .env.local   # fill in API keys, REDIS_URL is pre-populated
pnpm dev                     # http://localhost:3000
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
| `src/app/dashboard/`   | #12 | Real-time visualization dashboard |

## Container build

Chainguard zero-CVE base images for both builder and runtime.

```bash
docker build -t phalanx .
docker run -p 3000:3000 --env-file .env.local phalanx
```
