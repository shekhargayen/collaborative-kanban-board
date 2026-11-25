import pg from "pg";
import { config } from "../config.js";
import { NOTIFY_CHANNEL } from "./events.js";

/** Settings for a raw `pg` connection derived from the Prisma DATABASE_URL. */
function pgConfig(): pg.ClientConfig {
  const url = new URL(config.databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  // Strip Prisma-specific / ssl params; TLS is configured explicitly below.
  for (const k of ["sslmode", "schema", "connection_limit", "pool_timeout", "pgbouncer", "sslaccept"]) url.searchParams.delete(k);
  const ssl =
    sslmode && sslmode !== "disable"
      ? config.databaseCaCert
        ? { ca: config.databaseCaCert, rejectUnauthorized: true }
        : { rejectUnauthorized: false } // same as Prisma's default for sslmode=require
      : undefined;
  return { connectionString: url.toString(), ssl };
}

type Listener = () => void;

/**
 * One LISTEN connection per server instance, opened only while someone is streaming events.
 * A NOTIFY from any instance wakes all local SSE streams so they fetch new events immediately.
 * If LISTEN fails, streams still work through their poll fallback.
 */
class Notifier {
  private client: pg.Client | null = null;
  private connecting: Promise<void> | null = null;
  private listeners = new Set<Listener>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    void this.ensureConnected();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) void this.close();
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private ensureConnected() {
    if (this.client || this.connecting) return this.connecting ?? Promise.resolve();
    this.connecting = (async () => {
      const client = new pg.Client(pgConfig());
      client.on("notification", () => this.emit());
      const drop = () => {
        if (this.client === client) this.client = null;
        client.end().catch(() => {});
      };
      client.on("error", (err) => {
        console.warn("LISTEN connection error:", err.message);
        drop();
      });
      client.on("end", drop);
      await client.connect();
      await client.query(`LISTEN ${NOTIFY_CHANNEL}`);
      this.client = client;
      if (this.listeners.size === 0) await this.close();
    })()
      .catch((err) => console.warn("LISTEN unavailable, falling back to polling:", err.message))
      .finally(() => {
        this.connecting = null;
      });
    return this.connecting;
  }

  async close() {
    const c = this.client;
    this.client = null;
    await c?.end().catch(() => {});
  }
}

export const notifier = new Notifier();
