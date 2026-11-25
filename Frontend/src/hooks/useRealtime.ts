import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { API_BASE } from "../api/client";
import { BOARD_KEY, sync } from "../lib/sync";
import type { StreamMessage } from "../lib/types";

export type ConnectionState = "connecting" | "live" | "reconnecting";

const RECONNECT_MS = 3000;

/**
 * Subscribes to GET /api/events (Server-Sent Events) and feeds every event to the sync engine.
 * - The browser reconnects automatically and sends `Last-Event-ID`; the server replays missed events.
 * - If the stream is closed for good we reconnect manually, passing `?lastEventId=`.
 * - `resync` (server restarted / gap too old) → refetch the whole board.
 */
export function useRealtime(): ConnectionState {
  const qc = useQueryClient();
  const [state, setState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    let es: EventSource | null = null;
    let lastEventId = "";
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let connectedOnce = false;

    const refetchBoard = () => qc.refetchQueries({ queryKey: BOARD_KEY }, { cancelRefetch: false });

    const connect = () => {
      const url = new URL(`${API_BASE}/api/events`, window.location.origin);
      if (lastEventId) url.searchParams.set("lastEventId", lastEventId);
      es = new EventSource(url);

      es.onmessage = (e: MessageEvent<string>) => {
        if (e.lastEventId) lastEventId = e.lastEventId;
        let msg: StreamMessage;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "connected":
            setState("live");
            // Close the gap between the initial GET /board and the stream opening.
            if (!connectedOnce && qc.getQueryData(BOARD_KEY)) void refetchBoard();
            connectedOnce = true;
            break;
          case "resync":
            void refetchBoard();
            break;
          default:
            sync.handleEvent(msg);
        }
      };

      es.onerror = () => {
        if (disposed) return;
        setState("reconnecting");
        if (es?.readyState === EventSource.CLOSED) {
          es.close();
          retryTimer = setTimeout(connect, RECONNECT_MS);
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      es?.close();
    };
  }, [qc]);

  return state;
}
