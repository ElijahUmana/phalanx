# Phalanx WunderGraph Cosmo Supergraph

The federated API layer for the Phalanx parallel-fork CVE response fabric. Composes 4 Connect gRPC subgraphs under one Apollo-Federation-v2.5 supergraph, enforces per-tool OAuth scopes via `@requiresScopes`, and exposes persisted operations to Guild agents as MCP tools.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Guild agents (Analyst / Remediator / Rollout Operator)      │
│        └─→ MCP Gateway  (cosmo/mcp-gateway)  :stdio,:4006    │
│                   └─→ Cosmo Router            :3002          │
│                         ├─→ sbom-service      :4001 (gRPC)   │
│                         ├─→ deployment-service:4002 (gRPC)   │
│                         ├─→ risk-service      :4003 (gRPC)   │
│                         └─→ marketplace-srv   :4004 (gRPC)   │
│        └─→ jwt-mock issuer                    :4005          │
└──────────────────────────────────────────────────────────────┘
```

## @requiresScopes — per-tool OAuth enforcement

Every query/mutation field carries a `@requiresScopes` directive. The router inspects the caller's JWT at query-plan time and rejects fields whose scopes the caller doesn't hold. The same directive governs MCP tool calls, so a Guild Analyst agent cannot invoke production deploy — the router denies the query before the subgraph ever sees it.

| Agent role        | Scopes held                                                        |
|-------------------|---------------------------------------------------------------------|
| `ANALYST`         | read:sbom, read:deployment, read:risk, read:marketplace            |
| `REMEDIATOR`      | + write:staging                                                    |
| `ROLLOUT_OPERATOR`| + write:production (Guild human approval gate still applies)       |
| `UNAUTHORIZED`    | *(empty — 401 on any scope-gated field)*                           |

## Running locally

Prerequisites (install once):

```bash
pnpm install -g wgc@latest
wgc router download-binary -o ./router/bin          # run from cosmo/ dir
(cd jwt-mock       && npm install)
(cd mcp-gateway    && npm install)
for d in services/*; do (cd "$d" && npm install && npm run generate); done
wgc router compose -i ./graph.yaml -o ./config.json
```

Boot everything:

```bash
bash scripts/start-all.sh
```

Then verify the scope enforcement demo:

```bash
cd ..                                  # back to project root
npx tsx cosmo/scripts/demo-scopes.ts   # expect 9/9 pass
pnpm test:wundergraph                  # smoke test the TS client
```

## Example Queries

### Federated impact query (crosses 3 subgraphs)

Runs as an Analyst; reads sbom-service, risk-service, marketplace-service in one trip:

```graphql
query AnalystImpactQuery($repoId: ID!, $cveId: ID!) {
  dependencyTree(repoId: $repoId) {                    # sbom-service
    id
    name
    version
    risks {                                            # risk-service (entity merge)
      id
      cvssScore
      severity
      description
      remediationOptions {                             # marketplace-service (entity merge)
        strategy
        targetImage
        confidence
        provider
      }
    }
  }
  blastRadius(cveId: $cveId, repoId: $repoId) {        # risk-service
    servicesAffected
    transitiveDepth
    estimatedUsers
    criticalPath
  }
}
```

Variables:

```json
{ "repoId": "phalanx-demo/web", "cveId": "CVE-2020-8203" }
```

### CVE → risk score

```graphql
query AnalystRiskScore($cveId: ID!, $repoId: ID!) {
  cve(id: $cveId) {
    id
    cvssScore
    severity
    description
    exploitInWild
    nvdUrl
  }
  riskScore(cveId: $cveId, repoId: $repoId) {
    score
    reasoning
    affectedComponentCount
    transitiveImpact
  }
}
```

### Stage a deployment (write:staging)

```graphql
mutation RemediatorStageDeploy($input: StageDeploymentInput!) {
  stageDeployment(input: $input) {
    id
    repoId
    environment
    version
    status
    affectedServices
    hypothesisId
  }
}
```

Variables:

```json
{
  "input": {
    "repoId": "phalanx-demo/web",
    "version": "v1.3.0-rc2",
    "hypothesisId": "hyp-chainguard-swap",
    "affectedServices": ["api", "web"]
  }
}
```

### Rollout to production (write:production — Guild approval gate)

```graphql
mutation RolloutProductionDeploy($deploymentId: ID!) {
  rollout(deploymentId: $deploymentId) {
    deploymentId
    success
    message
    approvalRequired
  }
}
```

All example operations above are also available as persisted files under `mcp-gateway/operations/` and as MCP tools under the gateway.

## MCP Tools (Guild-facing)

`cosmo/mcp-gateway/` exposes 5 tools over stdio + HTTP. Each tool name binds to exactly one persisted GraphQL operation and one default agent role:

| Tool name                             | Operation                   | Required scopes                 | Default role        |
|---------------------------------------|-----------------------------|----------------------------------|---------------------|
| `phalanx_analyst_impact_query`        | AnalystImpactQuery          | read:sbom, read:risk             | ANALYST             |
| `phalanx_analyst_risk_score`          | AnalystRiskScore            | read:risk                        | ANALYST             |
| `phalanx_remediator_options`          | RemediatorOptions           | read:marketplace                 | REMEDIATOR          |
| `phalanx_remediator_stage_deploy`     | RemediatorStageDeploy       | write:staging                    | REMEDIATOR          |
| `phalanx_rollout_production_deploy`   | RolloutProductionDeploy     | write:production                 | ROLLOUT_OPERATOR    |

Callers can pass `_roleOverride` on any tool argument to demonstrate scope failures — e.g. an Analyst attempting the production rollout tool receives a 403 with the exact missing scope in the error message.

## Files

- `graph.yaml` — 4-subgraph composition manifest for `wgc router compose`.
- `config.yaml` — router runtime config (JWT auth via JWKS, `require_authentication: true`).
- `config.json` — composed execution config (generated; checked in).
- `services/{sbom,deployment,risk,marketplace}-service/` — Connect RPC + Fastify subgraphs.
- `jwt-mock/` — mock JWKS + token endpoint at :4005.
- `mcp-gateway/` — custom MCP server (5 tools) + HTTP front-end at :4006.
- `scripts/start-all.sh` — one-command local stack.
- `scripts/demo-scopes.ts` — end-to-end scope enforcement test (9 expectations).
- `router/bin/router` — Cosmo Router binary (downloaded).
