# Phalanx multi-stage Dockerfile — Chainguard zero-CVE base images.
#
# Builder: `latest-dev` provides apk + shell + corepack for installing pnpm.
# Runtime: `latest` is distroless (no shell, no package manager) and runs as
# `nonroot` by default. Only the compiled .next + node_modules + public/ are
# copied in.

FROM cgr.dev/chainguard/node:latest-dev AS builder

# `latest-dev` drops privileges to `nonroot`; corepack enable needs to symlink
# into /usr/bin, so elevate just for the builder stage (discarded at runtime).
USER root

WORKDIR /app

ENV PNPM_HOME=/app/.pnpm-home
ENV PATH=$PNPM_HOME:$PATH

# Enable pnpm via corepack and install dependencies with the pinned version
# captured in package.json's packageManager field / lockfile.
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .
RUN pnpm build


FROM cgr.dev/chainguard/node:latest AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Chainguard `node:latest` runs as nonroot (UID 65532). Copy build outputs
# with the correct ownership so the runtime user can read them.
COPY --from=builder --chown=nonroot:nonroot /app/.next ./.next
COPY --from=builder --chown=nonroot:nonroot /app/node_modules ./node_modules
COPY --from=builder --chown=nonroot:nonroot /app/package.json ./package.json
COPY --from=builder --chown=nonroot:nonroot /app/public ./public
COPY --from=builder --chown=nonroot:nonroot /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD ["node_modules/.bin/next", "start"]
