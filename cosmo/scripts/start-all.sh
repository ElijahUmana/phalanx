#!/usr/bin/env bash
# Boot the entire Phalanx supergraph locally for the demo.
#
# Launches:
#   jwt-mock         :4005
#   sbom-service     :4001 (gRPC via Connect + Fastify/http2)
#   deployment-svc   :4002
#   risk-service     :4003
#   marketplace-svc  :4004
#   cosmo router     :3002
#
# Send SIGINT (Ctrl-C) to stop everything cleanly.
#
# Prereqs:
#   npm install completed in each of cosmo/services/*, cosmo/jwt-mock, cosmo/mcp-gateway
#   wgc router compose -i cosmo/graph.yaml -o cosmo/config.json already run
#   cosmo/router/bin/router present (downloaded via wgc router download-binary)

set -euo pipefail

COSMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$COSMO_DIR"

PIDS=()

cleanup() {
    echo ""
    echo "[start-all] stopping processes: ${PIDS[*]}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
}
trap cleanup SIGINT SIGTERM EXIT

echo "[start-all] launching jwt-mock on :4005"
(cd jwt-mock && npm run start --silent) &
PIDS+=($!)

for svc in sbom-service deployment-service risk-service marketplace-service; do
    echo "[start-all] launching $svc"
    (cd "services/$svc" && npm run start:service --silent) &
    PIDS+=($!)
done

# Give subgraphs a moment to bind ports before the router tries to dial them.
sleep 2

echo "[start-all] launching cosmo-router on :3002"
EXECUTION_CONFIG_FILE_PATH="$COSMO_DIR/config.json" \
ROUTER_CONFIG_PATH="$COSMO_DIR/config.json" \
    ./router/bin/router -config ./config.yaml &
PIDS+=($!)

echo ""
echo "[start-all] all processes launched. PIDs: ${PIDS[*]}"
echo "[start-all] router graphql: http://localhost:3002/graphql"
echo "[start-all] jwt issuer:     http://localhost:4005"
echo "[start-all] Ctrl-C to stop."
echo ""

wait
