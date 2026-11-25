import type { RequestHandler } from "express";
import { config } from "../config.js";

/** Artificial delay so optimistic updates are visible during development / demos. */
export const latency: RequestHandler = (_req, _res, next) => {
  if (config.latencyMs > 0) setTimeout(next, config.latencyMs);
  else next();
};
