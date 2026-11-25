import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FAIL_RATE: z.coerce.number().min(0).max(1).default(0),
  FAIL_METHODS: z.string().default("POST,PATCH,DELETE"),
  LATENCY_MS: z.coerce.number().int().min(0).default(0),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  clientOrigins: env.CLIENT_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
  failRate: env.FAIL_RATE,
  failMethods: new Set(env.FAIL_METHODS.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean)),
  latencyMs: env.LATENCY_MS,
} as const;
