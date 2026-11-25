import { useQuery } from "@tanstack/react-query";
import { fetchBoard } from "../api/tasks";
import { BOARD_KEY, sync } from "../lib/sync";

export function useBoard() {
  return useQuery({
    queryKey: BOARD_KEY,
    queryFn: async () => {
      sync.beginFetch();
      try {
        return sync.completeFetch(await fetchBoard());
      } catch (err) {
        sync.abortFetch();
        throw err;
      }
    },
  });
}
