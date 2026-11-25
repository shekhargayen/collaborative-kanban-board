import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  /**
   * Allowed browser origins (comma-separated). `*` = any; `https://*.vercel.app` style wildcards are supported.
   * The API uses no cookies or credentials, so allowing any origin is safe and is the default.
   */
  CLIENT_ORIGIN: z.string().default("*"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FAIL_RATE: z.coerce.number().min(0).max(1).default(0),
  FAIL_METHODS: z.string().default("POST,PATCH,DELETE"),
  LATENCY_MS: z.coerce.number().int().min(0).default(0),
  /** End each SSE stream after this many ms (0 = never). Defaults to 55s on Vercel, below the function time limit. */
  SSE_MAX_MS: z.coerce.number().int().min(0).default(process.env.VERCEL ? 55_000 : 0),
  /** Fallback poll interval for new events if LISTEN/NOTIFY is unavailable. */
  EVENT_POLL_MS: z.coerce.number().int().min(250).default(2000),
  /** Max Prisma connections per server instance (keeps small managed Postgres plans within their limit). */
  DB_POOL_SIZE: z.coerce.number().int().positive().default(5),
  /** Optional CA certificate (PEM) to verify the database's TLS certificate. */
  DATABASE_CA_CERT: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

/** Build a matcher for a comma-separated list of origins, supporting `*` and `*` wildcards inside a pattern. */
function originMatcher(list: string) {
  const patterns = list.split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  if (patterns.includes("*")) return () => true;
  const regexes = patterns.map(
    (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`, "i"),
  );
  return (origin: string) => regexes.some((r) => r.test(origin));
}

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  isAllowedOrigin: originMatcher(env.CLIENT_ORIGIN),
  failRate: env.FAIL_RATE,
  failMethods: new Set(env.FAIL_METHODS.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean)),
  latencyMs: env.LATENCY_MS,
  databaseUrl: env.DATABASE_URL,
  databaseCaCert: env.DATABASE_CA_CERT?.replace(/\\n/g, "\n"),
  dbPoolSize: env.DB_POOL_SIZE,
  sseMaxMs: env.SSE_MAX_MS,
  eventPollMs: env.EVENT_POLL_MS,
} as const;
