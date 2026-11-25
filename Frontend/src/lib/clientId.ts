function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Fallback for non-secure contexts (e.g. opening the app via a LAN IP over http).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const newId = uuid;

/**
 * Unique per page load (i.e. per tab). Sent as `X-Client-Id` on every write; the server echoes
 * it on the realtime event so we can tell our own changes from other users'.
 */
export const CLIENT_ID = uuid();
