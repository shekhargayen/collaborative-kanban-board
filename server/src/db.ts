import { PrismaClient } from "@prisma/client";
import { config } from "./config.js";

/** Add a per-instance connection limit unless the URL already sets one. */
function withPoolLimit(url: string) {
  const u = new URL(url);
  if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", String(config.dbPoolSize));
  return u.toString();
}

export const prisma = new PrismaClient({ datasourceUrl: withPoolLimit(config.databaseUrl) });
