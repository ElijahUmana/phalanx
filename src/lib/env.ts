import { z } from 'zod';
import { config } from 'dotenv';

config({ path: '.env.local' });

const EnvSchema = z.object({
  REDIS_URL: z.string().url(),
  TINYFISH_API_KEY: z.string().min(1),
  SENSO_API_KEY: z.string().min(1),

  INSFORGE_API_KEY: z.string().optional(),
  CDP_API_KEY_ID: z.string().optional(),
  CDP_API_KEY_SECRET: z.string().optional(),
  CDP_WALLET_SECRET: z.string().optional(),
  PHALANX_WALLET_PRIVATE_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  NEXLA_SLACK_WEBHOOK_URL: z.string().url().optional(),
  NEXLA_ACCESS_TOKEN: z.string().optional(),
  NEXLA_API_URL: z.string().url().default('https://dataops.nexla.io/nexla-api'),

  GHOST_DB_NAME: z.string().default('phalanx-deps'),

  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIM: z.coerce.number().default(1536),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid or missing environment variables.\n${missing}\n\n` +
        `Copy .env.example to .env.local and fill in required keys (REDIS_URL, TINYFISH_API_KEY, SENSO_API_KEY).`
    );
  }
  cached = result.data;
  return cached;
}

export function hasEmbeddingProvider(): boolean {
  const e = env();
  return !!(e.ANTHROPIC_API_KEY || e.OPENAI_API_KEY);
}
