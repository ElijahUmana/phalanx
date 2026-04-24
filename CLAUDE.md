# Phalanx — Build Conventions

Concept brief: `../FINAL-CONCEPT.md`. Task assignments: see `README.md` owner table.

## Directory contract

Your subsystem code lives in `src/lib/<your-subsystem>/`. Do not touch other subsystems' directories — land your code in yours and coordinate via typed imports from `@/lib/<subsystem>`. The scaffold owner (me) has reserved all 10 subsystem dirs with placeholder `index.ts` files.

Integration tests for each data-layer subsystem live in `scripts/test-<subsystem>.ts` and exit non-zero on any failure. A test that "logs an error but returns 0" is a BUG — fix it.

## Non-negotiables

1. **Strict TypeScript.** No `any`. No `// @ts-expect-error` without a linked issue.
2. **All env vars flow through `src/lib/env.ts`.** Never read `process.env` directly. If you need a new var, add it to the zod schema in `env.ts` AND to `.env.example`.
3. **Real data, not mocks.** If you're testing your subsystem, hit real Ghost / real Redis / real TinyFish / real InsForge. The whole point of Phalanx is end-to-end correctness — mocked tests that pass but miss real wire failures are worthless here.
4. **Zero silent error swallowing.** Don't `catch {}`, don't return `null` on failure. Throw with context or surface a typed error. `try { ... } catch { return [] }` is a bug.
5. **No `process.exit()` inside library code.** That belongs only in scripts (`scripts/*.ts`).
6. **One embedding model across the whole system.** Defined in `env.EMBEDDING_MODEL` / `env.EMBEDDING_DIM`. Ghost's pgvector column dim and Redis Vector Sets dim MUST match this.

## Commit etiquette

- Write a descriptive commit message explaining WHY, not just WHAT. Follow the convention in the first commit.
- Commit format: `<type>(<subsystem>): <imperative summary>` — e.g. `feat(redis): add semantic cache with VSIM lookup`.
- Never commit `.env.local`, never commit real secrets, never commit `node_modules/`.

## Scripts

```bash
pnpm dev                # Next.js dev server
pnpm build              # production build
pnpm lint               # eslint
pnpm seed:ghost         # one-time: create phalanx-deps + seed real npm data (Task #3)
pnpm test:ghost         # end-to-end Ghost smoke test (fork, query, write, verify, delete)
pnpm test:redis         # end-to-end Redis smoke test (streams, pubsub, vectors, cache)
pnpm test:all           # both
```

## External services

| Service | Auth | Where |
|---------|------|-------|
| Ghost   | `ghost login` (shared CLI auth, already done) | cloud-hosted Postgres |
| Redis   | `REDIS_URL` in `.env.local`                   | Redis Cloud 8.4 (Vector Sets) |
| TinyFish | `TINYFISH_API_KEY`                           | tinyfish.io |
| Senso   | `SENSO_API_KEY`                                | senso.ai |
| InsForge | `INSFORGE_API_KEY` (Task #6 owner sets up)    | insforge.dev |
| CDP     | CDP keys (Task #7 owner)                       | Coinbase CDP / Base Sepolia |

## Next.js 16 notes

- App Router + Server Components by default; only add `'use client'` when you need interactivity.
- Next.js 16 uses `proxy.ts` (not `middleware.ts`) for request interception.
- Use `next/image` and `next/font` — no raw `<img>` for assets.
- `@vercel/postgres` and `@vercel/kv` are sunset; this project uses `pg` directly (for Ghost) and `redis` directly (for Redis Cloud).
