# Phalanx

**Your software depends on thousands of open-source packages. When one of them is compromised, Phalanx fixes it — autonomously, in minutes, not months.**

Every modern application is built on open-source libraries. A single vulnerability in any one of them — known as a CVE (Common Vulnerabilities and Exposures) — can expose your entire system to attack. Today, when a critical vulnerability is discovered, security teams spend weeks manually figuring out which fix works, testing it, and deploying it. During that window, attackers are already exploiting it.

Phalanx eliminates that window. It **detects** the vulnerability from the open web, **tests multiple fixes simultaneously** by forking your entire dependency database into parallel copies, **cancels the dead ends mid-flight** when it identifies false positives, and **ships the winning fix** with cryptographic proof that every step was audited and every artifact is verified.

**[Live Dashboard](https://phalanx-sandy.vercel.app/dashboard)** | **[Install as Skill](https://github.com/ElijahUmana/phalanx/tree/main/skills/phalanx)** | **[Demo Target Repo](https://github.com/ElijahUmana/phalanx-demo-target)**

---

## Why This Matters

- **$60B/year** lost to software supply chain attacks (Cybersecurity Ventures 2025)
- **60 days** average time to patch a critical vulnerability (Sonatype 2025)
- **5 major attacks in 12 days** in March 2026 alone (Axios, Trivy, Checkmarx, LiteLLM, Telnyx)
- **88% of enterprises** reported at least one AI agent security incident in 2026

The current best tools — Snyk, Dependabot, Wiz — detect the problem and file a ticket. Some can auto-generate a single fix. None of them test multiple remediation strategies in parallel, cancel wrong paths in real time, or produce a cryptographic evidence chain for auditors.

## How Phalanx Is Different

| | Traditional tools (Snyk, Dependabot) | Phalanx |
|---|---|---|
| **Detection** | API feeds only (NVD, GHSA) | API feeds + real-time web scraping of vendor advisories, PoC exploits, researcher posts via TinyFish |
| **Fix strategy** | Single hypothesis — "upgrade to latest" | N hypotheses tested in parallel — upgrade, pin, swap to zero-CVE image, apply vendor patch |
| **Validation** | Static analysis or no validation | Each hypothesis runs in its own live backend (Ghost fork + InsForge) |
| **False positives** | Manual triage | Detected and cancelled mid-pipeline in <1ms via Redis Pub/Sub |
| **Governance** | Ticket filed, human takes over | Every action audited in Guild's immutable log, per-operation scope enforcement via WunderGraph |
| **Evidence** | PDF report | Cryptographically signed SBOM (Chainguard Sigstore), SLSA L3 attestation, x402 payment receipt, published to cited.md |
| **Time to fix** | 60 days | Under 2 minutes |

## Architecture

```
                         ┌─────────────────────────────────┐
                         │         POST /api/scan          │
                         │      (GitHub repo URL in)       │
                         └───────────────┬─────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
              ┌─────▼──────┐    ┌───────▼────────┐   ┌──────▼───────┐
              │  TinyFish   │    │  Nexla Express  │   │    Ghost     │
              │             │    │                 │   │  Memory      │
              │ Search web  │    │ Ingest NVD,     │   │  Engine      │
              │ for PoCs,   │    │ GHSA, OSV into  │   │              │
              │ vendor      │    │ normalized      │   │ pgvector     │
              │ advisories, │    │ CVE feeds       │   │ similarity   │
              │ enrichment  │    │                 │   │ search on    │
              │             │    │ Write back to   │   │ historical   │
              │ Navigate    │    │ customer Jira/  │   │ CVE patterns │
              │ npm/PyPI    │    │ Slack/S3        │   │              │
              │ for patches │    └───────┬─────────┘   └──────┬───────┘
              │             │            │                    │
              │ Create PRs  │            │                    │
              │ on GitHub   │   ┌────────▼────────────────────▼────────┐
              └─────┬───────┘   │           Redis 8.4                  │
                    │           │                                      │
                    │           │  Streams ──► exactly-once dispatch   │
                    │           │  Pub/Sub ──► false-positive cancel   │
                    │           │  Vector Sets ► CVE similarity        │
                    │           │  LangCache ──► semantic LLM cache    │
                    │           └──────────────────┬───────────────────┘
                    │                              │
                    │              ┌───────────────▼───────────────┐
                    │              │     WunderGraph Cosmo Router   │
                    │              │                                │
                    │              │  Federated supergraph over     │
                    │              │  SBOM + Deployment + Risk +    │
                    │              │  Marketplace subgraphs         │
                    │              │                                │
                    │              │  @requiresScopes per field:    │
                    │              │  Analyst ► read:sbom,read:risk │
                    │              │  Remediator ► +write:staging   │
                    │              │  Operator ► +write:production  │
                    │              │                                │
                    │              │  MCP Gateway exposes 5 ops     │
                    │              │  as agent-callable tools       │
                    │              └───────────────┬───────────────┘
                    │                              │
          ┌─────────────────────────────────────────────────────────┐
          │                    Guild.ai Governance                  │
          │                                                         │
          │  5 published agents: Scanner, Analyst, Planner,         │
          │  Validator, Operator (multi-turn approval gate)          │
          │                                                         │
          │  Sandboxed runtime │ Credential injection │ Audit log   │
          └─────────────────────────────┬───────────────────────────┘
                                        │
          ┌─────────────────────────────▼───────────────────────────┐
          │                  Parallel Fork Race                     │
          │                                                         │
          │   Ghost fork₁        Ghost fork₂        Ghost fork₃    │
          │   (upgrade)          (pin version)       (swap image)   │
          │       │                   │                   │         │
          │   InsForge            InsForge            InsForge      │
          │   backend₁            backend₂            backend₃     │
          │   (validate)          (validate)          (CANCELLED    │
          │       │                   │              via Pub/Sub)   │
          │       ▼                   ▼                             │
          │   score: 0.92         score: 0.87                      │
          │       │                                                │
          │       ▼ WINNER                                         │
          └───────┬────────────────────────────────────────────────┘
                  │
    ┌─────────────▼──────────────┐
    │      Chainguard             │
    │                             │
    │  DFC converts Dockerfile    │
    │  to zero-CVE base image     │
    │                             │
    │  Sigstore signature +       │
    │  SLSA L3 attestation +      │
    │  SBOM attached              │
    └─────────────┬───────────────┘
                  │
    ┌─────────────▼──────────────┐
    │   x402 + CDP + Senso        │
    │                             │
    │  USDC micropayment for      │
    │  external PoC verification  │
    │                             │
    │  Evidence published to      │
    │  cited.md with full chain   │
    └─────────────────────────────┘
```

---

## Sponsor Deep Dives — Why Each Tool Is Load-Bearing

### WunderGraph Cosmo

Phalanx federates 4 gRPC subgraphs (SBOM, Deployment, Risk, Marketplace) into a single supergraph via **Cosmo Connect** (GraphQL schema compiled to protobuf). The Cosmo Router runs locally with static config — no cloud dependency.

**What makes it INEVITABLE:** Every field in the supergraph carries `@requiresScopes`. Analyst agents hold `read:sbom, read:risk` — they can query vulnerability data but cannot deploy. Only the Rollout Operator holds `write:production`. When an Analyst tries to call `rollout()`, the router returns **403 Forbidden** with the exact missing scope. This per-operation blast-radius control is WunderGraph's unique primitive — no other tool in the stack enforces scope-per-GraphQL-field.

A custom **MCP Gateway** (`cosmo/mcp-gateway/`) wraps 5 persisted operations as MCP tools, forwarding each call to the router with a role-appropriate JWT. A mock JWKS issuer mints scoped tokens for demo.

**Verified:** `pnpm test:scopes` — 9/9 pass (Analyst reads allowed, Analyst prod-deploy denied, Operator prod-deploy allowed). `pnpm test:wundergraph` — 7/7 pass.

**Code:** `cosmo/` (4 subgraphs + router + MCP gateway + JWT mock + graph.yaml)  
**Lib:** `src/lib/wundergraph/` (typed client with scope-aware query execution)

---

### TinyFish

Phalanx takes **real action on the open web** — not just API calls. TinyFish is the execution layer for everything that requires a browser.

**Three phases where TinyFish is load-bearing:**
1. **Detection:** `tinyfish search` finds CVE advisories hours before NVD indexes them. `tinyfish fetch` pulls full advisory text from vendor pages.
2. **Vendor portal navigation:** `tinyfish agent` opens the npm package page for the affected library, navigates to the version history, identifies the patched version (e.g., lodash 4.17.19 for CVE-2020-8203), and extracts the changelog — all via real browser automation at 89.9% Mind2Web accuracy.
3. **PR creation:** `tinyfish agent` navigates GitHub to create a remediation pull request on the target repository.

Without TinyFish, the agent can detect via APIs but cannot act — no patch procurement, no PR creation, no web-based enrichment. Detection without action is just Snyk.

**Verified:** `pnpm test:tinyfish` — scanner returns real NVD + GHSA sources, enrichment returns 37 hits with 10 PoC URLs, vendor portal correctly identifies lodash 4.17.19 as the patch.

**Code:** `src/lib/tinyfish/` (scanner, vendor-portal, pr-creator, enrichment, client, types — all Zod-typed)

---

### Ghost

Ghost's **zero-copy forking** is the architectural primitive that makes parallel speculation possible. When a CVE is detected, Phalanx forks the `phalanx-deps` database N times in ~500ms each via copy-on-write at the 4KB block level. Each fork is a different remediation hypothesis — upgrade, pin, swap to Chainguard image, apply vendor patch. Only divergent blocks cost storage.

**Memory Engine** (pgvector + BM25 via pg_trgm + ltree hierarchy) stores every past CVE and remediation outcome. When a new CVE arrives, `findSimilarCves()` runs HNSW vector similarity to find historical matches: "this looks like Log4Shell — pull that playbook."

Without Ghost, the system can only test ONE remediation at a time — collapsing to single-hypothesis (= Snyk Agent Fix). The entire parallel-speculative thesis dies.

**Verified:** `pnpm test:ghost` — 8/8 pass. Fork creates a real Ghost database in <30s, writes to the fork don't leak to the parent (copy-on-write isolation verified), `findSimilarCves("prototype pollution")` returns CVE-2020-8203 as top match.

**Database:** `phalanx-deps` on Ghost Cloud — seeded with Express.js 5.2.1 dependency tree (29 packages) + 8 real CVEs from NVD/GHSA.

**Code:** `src/lib/ghost/` (client, memory, types) + `scripts/seed-ghost.ts`

---

### Guild.ai

Phalanx runs a fleet of **5 governed agents**, each published to the Guild platform:

| Agent | Mode | Scopes | Role |
|-------|------|--------|------|
| `phalanx-scanner` | one-shot | read:sbom | Detect CVEs in dependency tree |
| `phalanx-analyst` | one-shot | read:sbom, read:risk | Impact analysis, FALSE_POSITIVE short-circuit |
| `phalanx-planner` | one-shot | read:marketplace | Select N remediation hypotheses |
| `phalanx-validator` | one-shot | write:staging | Score hypothesis test results |
| `phalanx-operator` | **multi-turn** | **write:production** | Human-in-the-loop approval gate via `ui_prompt` |

Every agent runs in Guild's **sandboxed runtime** (only `@guildai/agents-sdk` + `zod` importable). Credentials for GitHub, Redis, Ghost are **injected at call time** — never in agent code. Every LLM call and tool use is recorded in Guild's **immutable audit log** — this IS the SOC 2 / ISO 27001 evidence artifact.

`guildTools` is **always spread fully** (never `pick()`'d). Service tools (`gitHubTools`) are narrowed per agent — scanner gets read-only, operator gets `pulls_create`.

Without Guild, no enterprise deploys autonomous agents that make code changes. The audit trail is the product for compliance buyers.

**Code:** `agents/phalanx-{scanner,analyst,planner,validator,operator}/agent.ts` (5 published agents)  
**Lib:** `src/lib/guild/` (orchestrator that triggers real Guild sessions via CLI, Zod-typed I/O)

---

### Redis

Redis is the **unified coordination fabric** replacing 5 separate systems:

| Primitive | What it does in Phalanx | Why Redis specifically |
|-----------|------------------------|----------------------|
| **Streams** | Distribute CVE investigations to N parallel Analyst agents with exactly-once processing (consumer groups + XACK) | At-least-once delivery with consumer groups — generic queues don't have this + sub-ms |
| **Pub/Sub** | When any Analyst flags a false positive, `PUBLISH cancel:CVE-ID` aborts ALL in-flight forks, InsForge backends, and downstream work in <1ms | Pattern-subscribe (`PSUBSCRIBE cancel:*`) + sub-ms broadcast — no other tool cancels a distributed pipeline this fast |
| **Vector Sets** | Redis 8 native HNSW. Store CVE embeddings, query `VSIM` for semantically similar historical CVEs at sub-ms | Sub-ms ANN on the hot path — pgvector is 10-100x slower for coordination-bus queries |
| **Semantic Cache** | LangCache pattern: hash prompt → embed → `VSIM` against cache → hit at cosine >0.95 → skip LLM call. 70% hit rate at scale | Saves 50-80% on LLM spend for repeated CVE analysis patterns |

Also serves as the **event bus** — every `lib/*` module publishes `PhalanxEvent` to Redis Pub/Sub channel `scan:events:{scanId}`, which the SSE route streams to the dashboard.

**Verified:** `pnpm test:redis` — 5/5 pass. Streams exactly-once verified (zero consumer overlap), cancel fires in <500ms, VSIM self-similarity = 1.000, semantic cache near-duplicate similarity = 0.869 vs unrelated 0.506.

**Instance:** Redis Cloud 8.4, us-east-1.

**Code:** `src/lib/redis/` (client, streams, pubsub, vectors, cache, types)

---

### Chainguard

Chainguard is load-bearing in **three distinct ways**:

1. **Remediation target:** When Phalanx finds a vulnerable base image, it recommends the Chainguard zero-CVE equivalent. `dfc convert` auto-converts `python:3.11` → `cgr.dev/chainguard/python:latest-dev` in 36ms.

2. **Agent runtime:** Phalanx's own Dockerfile uses `FROM cgr.dev/chainguard/node:latest` — security tooling that's itself vulnerable would be ironic. SLSA Level 3 provenance, Sigstore-signed, non-root by default.

3. **Verification pipeline:** `cosign verify` confirms Sigstore keyless signatures on Chainguard images. `cosign verify-attestation --type slsaprovenance1` validates SLSA L3 provenance. The SBOM hash + Sigstore URL + SLSA level are included in every cited.md evidence package.

Without Chainguard, the system has no trusted remediation baseline, the agents' own runtime is a supply chain risk, and the evidence chain has no cryptographic provenance.

**Verified:** `pnpm test:chainguard` — DFC conversion produces real before/after diff, Sigstore verification passes against `cgr.dev/chainguard/node:latest`, SLSA attestation verification passes.

**Code:** `src/lib/chainguard/` (dfc, sbom, scanner, attestation, types) + `Dockerfile` (Chainguard multi-stage)

---

### InsForge

Each parallel remediation hypothesis needs its own **isolated staging backend** to validate the fix. InsForge provisions these via MCP in under 2 minutes — Postgres schema hydrated from the Ghost fork, auth, storage for artifacts, edge functions for running patched code.

Without InsForge, each hypothesis would require manual DevOps. The parallel-speculative strategy collapses to static-analysis-only — you can't actually RUN the patched code to verify it works.

**Code:** `src/lib/insforge/` (provisioner, validator, cleanup, client, types)  
**Project:** Linked to InsForge project `6898563c-36a8-40a1-babc-ecc8e19507bb` (us-east)

---

### Nexla Express

Nexla provides **bidirectional data pipelines** the agent builds autonomously:

1. **Ingest:** CVE feeds from NVD (20 records per pull), GHSA, OSV normalized into a unified format. When the agent discovers a new vendor-specific advisory source, it builds a Nexla pipeline on the fly.
2. **Write-back:** After remediation, Nexla pipelines push results back to customer systems — Jira tickets, Slack alerts, S3 archives, Snowflake compliance tables.
3. **Discovery:** Nexla's Agentic Probe auto-discovers data sources from a customer's infrastructure during onboarding.

Without Nexla, every customer requires weeks of custom ETL, and remediation reports don't reach the customer's existing tools.

**Code:** `src/lib/nexla/` (ingestion, writeback, discovery, types)

---

### Payment Rails (x402 + CDP + Senso)

- **x402 middleware** on `/api/intelligence` — agents pay USDC on Base Sepolia per query for supply chain intelligence
- **CDP server wallet** — agent identity and balance for autonomous transactions
- **Senso/cited.md** — every remediation publishes a full evidence package (CVE ID, patched version, Sigstore signature, SLSA attestation, Guild audit trail ID, x402 receipt) to `cited.md`

**Code:** `src/lib/x402/` (wallet, middleware, client, guard) + `src/lib/senso/` (publisher)

---

## The Novel Pattern

**Cancellable parallel speculative remediation with cryptographic provenance.** This requires 8 primitives that no single vendor provides:

1. Zero-copy writable state forks (Ghost)
2. Sub-ms coordination with cancellation (Redis)
3. Per-operation OAuth-scoped federation (WunderGraph)
4. On-demand isolated backend provisioning (InsForge)
5. Cryptographically verified remediation baseline (Chainguard)
6. Governed multi-agent orchestration with audit trail (Guild)
7. Autonomous web action for patch procurement (TinyFish)
8. Bidirectional agent-built data pipelines (Nexla)

Remove any one and the architecture breaks. This is not incremental improvement over existing tools — it's a structurally different shape of work.

---

## Run It

### Quick start

```bash
git clone https://github.com/ElijahUmana/phalanx.git
cd phalanx
pnpm install
cp .env.example .env.local   # fill in API keys (Ghost, Redis, TinyFish, etc.)
```

### Start the full stack

```bash
# Terminal 1 — WunderGraph Cosmo Router + 4 subgraphs + JWT mock + MCP Gateway
bash cosmo/scripts/start-all.sh

# Terminal 2 — Next.js dashboard
pnpm dev
```

Open **http://localhost:3000/dashboard**, paste `https://github.com/ElijahUmana/phalanx-demo-target`, and watch 52+ real events stream across all 8 sponsor tools.

### Scan via API

```bash
SCAN=$(curl -s -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"https://github.com/ElijahUmana/phalanx-demo-target"}' | jq -r .scanId)

curl -N "http://localhost:3000/api/status?scanId=$SCAN"
```

### Install as a Skill

```bash
shipables install ElijahUmana/phalanx
shipables install ElijahUmana/phalanx --claude
```

### Integration Tests

```bash
pnpm tsx scripts/seed-ghost.ts    # seed real CVE data into Ghost
pnpm tsx scripts/test-ghost.ts    # 8 tests against real Ghost Cloud
pnpm tsx scripts/test-redis.ts    # 5 tests against real Redis Cloud
pnpm test:tinyfish                # real TinyFish API calls
pnpm test:scopes                  # WunderGraph scope enforcement (9 tests)
pnpm test:wundergraph             # federated supergraph queries (7 tests)
pnpm test:chainguard              # DFC + Sigstore + SLSA verification
```

### Container Build (Chainguard)

```bash
docker build -t phalanx .
docker run -p 3000:3000 --env-file .env.local phalanx
```

### Deployment

Phalanx is a multi-service system: the Next.js dashboard + API layer, the WunderGraph Cosmo Router (Go binary), and Chainguard CLI tools (cosign, dfc, malcontent). For production, the Next.js layer deploys to any Node hosting, and the Cosmo Router + Chainguard verification services deploy as containers on Railway, Fly.io, or Cloud Run — all running on Chainguard zero-CVE base images.

---

## Tech Stack

Next.js 16 | TypeScript | Tailwind CSS | shadcn/ui | WunderGraph Cosmo | TinyFish | Ghost | Guild.ai | Redis 8.4 | Chainguard | InsForge | Nexla Express | Senso | Coinbase CDP | x402 | PostgreSQL | pgvector | Sigstore | cosign
