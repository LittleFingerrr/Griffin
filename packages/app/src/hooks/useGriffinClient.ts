import { useMemo } from "react";
import { GriffinClient } from "@griffin/sdk";
import { GRIFFIN_API_URL } from "../config";

export function useGriffinClient() {
  return useMemo(
    () => new GriffinClient({ baseUrl: GRIFFIN_API_URL, timeoutMs: 60_000 }),
    [],
  );
}
