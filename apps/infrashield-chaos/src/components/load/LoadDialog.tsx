import { useEffect, useRef, useState } from "react";
import type { CandidateFile, LoadOutcome } from "../../adapter.ts";
import { GitHubTab } from "./GitHubTab.tsx";
import { LoadSummaryView } from "./LoadSummaryView.tsx";
import { PasteTab } from "./PasteTab.tsx";
import { UploadTab } from "./UploadTab.tsx";
import { BACKDROP, DIALOG, ERROR, TABLIST, TITLE, tabStyle } from "./loadStyles.ts";
import { useLoadDialog } from "./useLoadDialog.ts";

// --- Types ---

export type LoadTab = "paste" | "upload" | "github";

export interface LoadDialogProps {
  readonly onLoad: (candidates: readonly CandidateFile[]) => Promise<LoadOutcome>;
  readonly onLoadGitHub: (ref: string) => Promise<LoadOutcome>;
  readonly onClose: () => void;
  readonly initialTab?: LoadTab;
  /** Prefills the GitHub tab (the ?repo query parameter). */
  readonly initialRepo?: string;
  /** Starts loading `initialRepo` once on mount. */
  readonly autoStart?: boolean;
}

const TABS: readonly { readonly id: LoadTab; readonly label: string }[] = [
  { id: "paste", label: "Paste code" },
  { id: "upload", label: "Upload files" },
  { id: "github", label: "GitHub repo" },
];

// --- Component ---

export function LoadDialog({ onLoad, onLoadGitHub, onClose, initialTab = "paste", initialRepo = "", autoStart = false }: LoadDialogProps) {
  const [tab, setTab] = useState<LoadTab>(initialTab);
  const { state, busy, loadFiles, loadRepo } = useLoadDialog({ onLoad, onLoadGitHub });
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true; // StrictMode runs effects twice
    loadRepo(initialRepo);
  }, [autoStart, initialRepo, loadRepo]);
  const tabRefs = useRef<Record<LoadTab, HTMLButtonElement | null>>({ paste: null, upload: null, github: null });

  const onTabKey = (e: React.KeyboardEvent, index: number): void => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const target = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (index + step + TABS.length) % TABS.length;
    if (step === 0 && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next = TABS[target].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div style={BACKDROP}>
      <div role="dialog" aria-modal="true" aria-labelledby="load-dialog-title" style={DIALOG} onKeyDown={onKeyDown}>
        <h2 id="load-dialog-title" style={TITLE}>Load code</h2>
        {state.status === "success" ? (
          <LoadSummaryView outcome={state.outcome} onDone={onClose} />
        ) : (
          <>
            <div role="tablist" aria-label="Load source" style={TABLIST}>
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`load-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`load-panel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  ref={(el) => { tabRefs.current[t.id] = el; }}
                  style={tabStyle(tab === t.id)}
                  onClick={() => setTab(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="load-panel-paste" aria-labelledby="load-tab-paste" hidden={tab !== "paste"}>
              <PasteTab disabled={busy} onSubmit={loadFiles} />
            </div>
            <div role="tabpanel" id="load-panel-upload" aria-labelledby="load-tab-upload" hidden={tab !== "upload"}>
              <UploadTab disabled={busy} onSubmit={loadFiles} />
            </div>
            <div role="tabpanel" id="load-panel-github" aria-labelledby="load-tab-github" hidden={tab !== "github"}>
              <GitHubTab disabled={busy} initialRepo={initialRepo} onSubmit={loadRepo} />
            </div>
            <div role="status" aria-live="polite" style={{ fontSize: "0.75rem", color: "#8b949e", marginTop: 8 }}>
              {busy ? "Loading…" : ""}
            </div>
            {state.status === "error" && <div role="alert" style={ERROR}>{state.message}</div>}
          </>
        )}
      </div>
    </div>
  );
}
