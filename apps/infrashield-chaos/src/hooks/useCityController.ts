import { useCallback, useEffect, useState } from "react";
import type { CyberCityLayout, FaultType, InfraShieldAdapter, SREDashboardData } from "../adapter";
import { highestCentralityId } from "../components/city/faultTarget.ts";
import { getAudioEngine } from "../audio";

// --- Constants ---
const PATCH_POLL_MS = 500;

// --- Types ---
export interface CityController {
  readonly layout: CyberCityLayout;
  readonly selectedId: string | null;
  readonly faultType: FaultType;
  readonly patch: SREDashboardData["lastPatch"];
  readonly isPatchApplied: boolean;
  readonly actionError: string | null;
  /** Increments on every repository switch; use as a key to reset per-repository UI state. */
  readonly repoEpoch: number;
  /** Replaces the city with another repository's layout and clears all per-repository UI state. */
  readonly switchRepository: (next: CyberCityLayout) => void;
  readonly setSelectedId: (id: string | null) => void;
  readonly setFaultType: (type: FaultType) => void;
  readonly inject: () => void;
  readonly reset: () => void;
  readonly applyPatch: () => void;
  readonly rollback: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- Hook ---
export function useCityController(
  adapter: InfraShieldAdapter,
  initialLayout: CyberCityLayout
): CityController {
  const [layout, setLayout] = useState(initialLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [faultType, setFaultType] = useState<FaultType>("UNCAUGHT_EXCEPTION");
  const [patch, setPatch] = useState<SREDashboardData["lastPatch"]>(null);
  const [isPatchApplied, setIsPatchApplied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [repoEpoch, setRepoEpoch] = useState(0);

  // --- Patch refresh: the AI patch can replace the rule-based one after inject ---
  const hasFault = layout.activeFault !== null;
  useEffect(() => {
    if (!hasFault || isPatchApplied) return undefined;
    const timer = setInterval(() => setPatch(adapter.getSREDashboard().lastPatch), PATCH_POLL_MS);
    return () => clearInterval(timer);
  }, [adapter, hasFault, isPatchApplied]);

  // --- Actions ---
  const run = useCallback((action: () => Promise<void>): void => {
    setActionError(null);
    action().catch((error: unknown) => setActionError(messageOf(error)));
  }, []);

  const inject = useCallback(() => run(async () => {
    const targetFunctionId = selectedId ?? highestCentralityId(layout.nodes);
    if (targetFunctionId === null) return;
    const next = await adapter.injectFault({ targetFunctionId, faultType });
    setLayout(next);
    setPatch(adapter.getSREDashboard().lastPatch);
    setIsPatchApplied(false);
    getAudioEngine().playFaultAlarm();
  }), [run, adapter, selectedId, layout.nodes, faultType]);

  const reset = useCallback(() => run(async () => {
    setLayout(await adapter.reset());
    setPatch(null);
    setIsPatchApplied(false);
    setSelectedId(null);
  }), [run, adapter]);

  const switchRepository = useCallback((next: CyberCityLayout): void => {
    setLayout(next);
    setSelectedId(null);
    setPatch(null);
    setIsPatchApplied(false);
    setActionError(null);
    setRepoEpoch((epoch) => epoch + 1);
  }, []);

  const applyPatch = useCallback(() => run(async () => {
    if (patch === null) return;
    await adapter.applyMutation({ splices: patch.suggestedSplices });
    setLayout(adapter.getLayout());
    setIsPatchApplied(true);
    getAudioEngine().playPatchApplied();
  }), [run, adapter, patch]);

  const rollback = useCallback(() => run(async () => {
    await adapter.rollbackLastMutation();
    setLayout(adapter.getLayout());
    setPatch(adapter.getSREDashboard().lastPatch);
    setIsPatchApplied(false);
    getAudioEngine().playPatchRollback();
  }), [run, adapter]);

  return {
    layout, selectedId, faultType, patch, isPatchApplied, actionError, repoEpoch, switchRepository,
    setSelectedId, setFaultType, inject, reset, applyPatch, rollback,
  };
}
