import { useCallback, useEffect, useRef, useState } from "react";
import type { CyberCityLayout, InfraShieldAdapter } from "../adapter.ts";

// --- Types ---

export type AdapterLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly adapter: InfraShieldAdapter;
      readonly layout: CyberCityLayout;
    };

export interface AdapterLoader {
  readonly state: AdapterLoadState;
  readonly retry: () => void;
}

// --- Load sequence ---

async function loadAdapter(): Promise<{ adapter: InfraShieldAdapter; layout: CyberCityLayout }> {
  const { createInfraShieldAdapter } = await import("../adapter.ts");
  const adapter = createInfraShieldAdapter();
  const layout = await adapter.loadSampleRepository();
  return { adapter, layout };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- Hook ---

export function useAdapterLoader(): AdapterLoader {
  const [state, setState] = useState<AdapterLoadState>({ status: "loading" });
  const [request, setRequest] = useState(0);
  const latestAttempt = useRef(0);

  useEffect(() => {
    latestAttempt.current += 1;
    const attempt = latestAttempt.current;

    const run = async (): Promise<void> => {
      try {
        const { adapter, layout } = await loadAdapter();
        if (attempt === latestAttempt.current) setState({ status: "ready", adapter, layout });
      } catch (error) {
        if (attempt === latestAttempt.current) setState({ status: "error", message: messageOf(error) });
      }
    };
    void run();

    return () => {
      if (latestAttempt.current === attempt) latestAttempt.current += 1;
    };
  }, [request]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRequest((value) => value + 1);
  }, []);

  return { state, retry };
}
