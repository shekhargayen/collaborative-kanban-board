import type { RequestHandler } from "express";

/**
 * Every browser tab sends a random `X-Client-Id`. It is attached to the realtime
 * events caused by that request so the tab can ignore its own echoes.
 */
export const clientId: RequestHandler = (req, res, next) => {
  const id = req.get("x-client-id") ?? (typeof req.query.clientId === "string" ? req.query.clientId : undefined);
  res.locals.clientId = id && id.length <= 100 ? id : null;
  next();
};
