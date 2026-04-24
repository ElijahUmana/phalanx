-- Phalanx dependency-state schema.
-- Applied once via `ghost sql phalanx-deps < scripts/seed-data/schema.sql`.
-- Memory Engine = pgvector (HNSW) + pg_trgm (BM25-ish) + ltree (transitive dep paths).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS dependencies (
  id              SERIAL PRIMARY KEY,
  package_name    TEXT NOT NULL,
  version         TEXT NOT NULL,
  registry        TEXT NOT NULL DEFAULT 'npm',
  license         TEXT,
  transitive_deps JSONB NOT NULL DEFAULT '[]'::jsonb,
  dep_path        LTREE,
  introduced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dependencies_unique UNIQUE (package_name, version, registry)
);
CREATE INDEX IF NOT EXISTS dependencies_transitive_gin ON dependencies USING GIN (transitive_deps);
CREATE INDEX IF NOT EXISTS dependencies_path_gist ON dependencies USING GIST (dep_path);
CREATE INDEX IF NOT EXISTS dependencies_name_idx ON dependencies (package_name);

CREATE TABLE IF NOT EXISTS services (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  repo_url        TEXT NOT NULL,
  description     TEXT,
  dependency_ids  INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cves (
  cve_id              TEXT PRIMARY KEY,
  severity            TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'informational')),
  cvss_score          NUMERIC(3,1),
  affected_packages   JSONB NOT NULL,
  patch_versions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  discovery_source    TEXT NOT NULL,
  description         TEXT NOT NULL,
  embedding           VECTOR(1536),
  published_at        TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'remediated', 'false_positive')),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cves_embedding_hnsw ON cves USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS cves_description_trgm ON cves USING GIN (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cves_severity_idx ON cves (severity, status);

CREATE TABLE IF NOT EXISTS remediation_memories (
  id              SERIAL PRIMARY KEY,
  cve_id          TEXT REFERENCES cves(cve_id) ON DELETE CASCADE,
  hypothesis      TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('success', 'false_positive', 'regression', 'partial')),
  playbook        JSONB NOT NULL,
  embedding       VECTOR(1536),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS remediations_embedding_hnsw ON remediation_memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS remediations_cve_idx ON remediation_memories (cve_id);

CREATE TABLE IF NOT EXISTS patch_results (
  id              SERIAL PRIMARY KEY,
  cve_id          TEXT NOT NULL REFERENCES cves(cve_id) ON DELETE CASCADE,
  hypothesis      TEXT NOT NULL,
  fork_id         TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('success', 'false_positive', 'regression', 'partial', 'cancelled')),
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS patch_results_cve_idx ON patch_results (cve_id);
CREATE INDEX IF NOT EXISTS patch_results_fork_idx ON patch_results (fork_id);
