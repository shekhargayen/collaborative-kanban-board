import type { RequestHandler } from "express";
import { config } from "../config.js";

/**
 * Randomly fails requests (before touching the DB) so the client's rollback logic can be tested.
 *
 * - FAIL_RATE     probability 0..1
 * - FAIL_METHODS  which methods are eligible (default POST,PATCH,DELETE)
 * - Header `X-Simulate-Failure: always | never` forces the outcome for a single request.
 */
export const failureSimulation: RequestHandler = (req, res, next) => {
  const override = req.get("x-simulate-failure")?.toLowerCase();
  if (override === "never") return next();

  const shouldFail =
    override === "always" || (config.failMethods.has(req.method) && Math.random() < config.failRate);

  if (shouldFail) {
    res.status(503).json({ error: "SimulatedFailure", message: "Simulated server failure. Please try again." });
    return;
  }
  next();
};
