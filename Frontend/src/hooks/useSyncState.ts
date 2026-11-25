import { useSyncExternalStore } from "react";
import { sync } from "../lib/sync";

/** True while a mutation for this task is in flight. */
export const useIsPending = (id: string) => useSyncExternalStore(sync.subscribe, () => sync.isPending(id));

/** True for a moment after another user changed this task. */
export const useIsFlashing = (id: string) => useSyncExternalStore(sync.subscribe, () => sync.isFlashing(id));
