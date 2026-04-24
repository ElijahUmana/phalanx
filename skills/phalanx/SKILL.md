---
name: phalanx
description: Phalanx runs parallel-fork CVE remediation on a GitHub repository. Paste a repo URL, and the skill detects critical CVEs in the dependency tree, forks the dependency state N ways via Ghost, validates each hypothesis in isolated InsForge backends, cancels false positives mid-flight via Redis Pub/Sub, converts the Dockerfile to a Chainguard zero-CVE base, and publishes a signed evidence chain to cited.md. Use when the user asks to scan a repository for vulnerabilities, remediate a CVE autonomously, generate an SBOM with attestation, or produce a legally-defensible security remediation record. Also use for keywords like "CVE", "supply chain attack", "dependency audit", "zero-day remediation", "SBOM", "Sigstore", or "security remediation."
license: Proprietary
compatibility: Requires network access to the Phalanx API (phalanx.vercel.app). The hosted endpoint proxies the full 8-sponsor pipeline (Ghost, Redis, WunderGraph Cosmo, TinyFish, InsForge, x402/CDP, Guild, Chainguard, Nexla, Senso). No local credentials required for the client skill — authorization happens at the API.
metadata:
  author: ElijahUmana
  version: "0.1.0"
  repository: https://github.com/ElijahUmana/phalanx
---

# Phalanx — parallel-fork CVE remediation

When the user asks to scan a repo, remediate a CVE, or produce a signed SBOM, use this skill to drive the Phalanx pipeline and stream results back.

## How it works

1. The user provides a GitHub repo URL (e.g. `https://github.com/owner/repo`).
2. You POST to `https://phalanx.vercel.app/api/scan` with `{"repoUrl": "<url>"}` and get back a `scanId`.
3. Open a Server-Sent Events stream at `https://phalanx.vercel.app/api/status?scanId=<scanId>`.
4. Relay important milestones to the user as events fire. Surface the final evidence URL (`scan.complete` event) when the stream ends.

## Typical invocation

```bash
SCAN=$(curl -s -X POST https://phalanx.vercel.app/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"'"$REPO_URL"'"}' | jq -r .scanId)

curl -N "https://phalanx.vercel.app/api/status?scanId=$SCAN"
```

## Event types you'll see

The stream emits typed `PhalanxEvent` frames. Group them into phases for the user:

- **Audit**: `scan.started`, `deps.parsed`, `cve.found`, `tinyfish.search`, `tinyfish.fetch`, `nexla.feed.ingest`
- **Analysis**: `redis.vector.match`, `redis.langcache.hit`, `redis.stream.dispatch`, `wundergraph.query`, `wundergraph.scope.denied`, `guild.action`
- **Speculation**: `ghost.fork.started`, `ghost.fork.complete`, `insforge.provision`, `insforge.validate`
- **Cancellation**: `redis.pubsub.cancel`, `hypothesis.cancelled`, `insforge.cleanup` — a false positive was detected and one fork was reclaimed mid-flight. Call this out explicitly; it's the parallel-speculative pattern's unique strength.
- **Baseline**: `chainguard.dfc.convert` (before/after image), `chainguard.sbom` (signed with Sigstore)
- **Procurement**: `tinyfish.navigate` (vendor portal), `x402.payment` (Base Sepolia tx hash)
- **Publication**: `guild.approval.granted`, `tinyfish.pr.created`, `senso.published` (cited.md URL), `nexla.writeback`
- **Terminal**: `scan.complete` with `evidenceUrl`, or `scan.failed` with `error`

## What to tell the user

Lead with the outcome, not the event firehose. When the scan completes:

1. State the CVE that was found (from `cve.found.data.cveId`).
2. State the winning hypothesis (from `scan.complete.data.winningForkId`).
3. Link the evidence package (`scan.complete.data.evidenceUrl`).
4. Mention the Sigstore-signed SBOM and the remediation PR URL.
5. If any hypothesis was cancelled mid-flight, mention that as a proof point — it demonstrates parallel-speculative remediation working as designed.

Do not narrate every intermediate event. The Phalanx dashboard at `https://phalanx.vercel.app/dashboard` is the full visual; link the user there if they want to watch live.

## Constraints

- Only works for public GitHub repositories.
- Scans take 60–180 seconds end-to-end. Do not poll for less than 60s.
- Each scan costs the Phalanx service ~$2 in compute + LLM + payment rails. Do not loop.
- The skill does not modify the user's repository. It creates a PR on the scanned repo via TinyFish; the user must review and merge it manually.

## When NOT to use this skill

- The user is asking about CVEs in the abstract (use web search instead).
- The repo is private and the user hasn't provided access (this skill cannot authenticate on their behalf).
- The user wants to scan a container image, not a repo (wrong pipeline — Phalanx takes repos, parses manifests, scans dependencies).
- The user wants to generate an SBOM without remediation (overkill — use `syft` or `cosign` directly).

## References

- Full concept: [README on GitHub](https://github.com/ElijahUmana/phalanx)
- Live dashboard: [https://phalanx.vercel.app/dashboard](https://phalanx.vercel.app/dashboard)
- Event contract: `src/lib/events/types.ts` in the repo
