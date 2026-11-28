import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { CandidateFile, LoadOutcome } from "../../adapter";
import { GitHubTab } from "./GitHubTab";
import { LoadSummaryView } from "./LoadSummaryView";
import { PasteTab } from "./PasteTab";
import { UploadTab } from "./UploadTab";
import { useLoadDialog } from "./useLoadDialog";
import "./load.css";

export type LoadTab = "paste" | "upload" | "github";

const TABS: readonly { readonly id: LoadTab; readonly label: string }[] = [
  { id: "paste", label: "Paste code" },
  { id: "upload", label: "Upload files" },
  { id: "github", label: "GitHub repo" },
];

interface Props {
  readonly onLoad: (candidates: readonly CandidateFile[]) => Promise<LoadOutcome>;
  readonly onLoadGitHub: (ref: string) => Promise<LoadOutcome>;
  readonly onClose: () => void;
  readonly initialTab?: LoadTab;
  readonly initialRepo?: string;
  /** Starts loading `initialRepo` from GitHub as soon as the dialog opens. */
  readonly autoStart?: boolean;
}

export function LoadDialog({ onLoad, onLoadGitHub, onClose, initialTab = "paste", initialRepo, autoStart = false }: Props) {
  const [tab, setTab] = useState<LoadTab>(initialTab);
  const { state, run } = useLoadDialog();
  const tabRefs = useRef<Partial<Record<LoadTab, HTMLButtonElement | null>>>({});
  const busy = state.status === "submitting";

  // Link-triggered load: runs once; the ref survives React StrictMode's second effect run.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || initialRepo === undefined || autoStarted.current) return;
    autoStarted.current = true;
    void run(() => onLoadGitHub(initialRepo));
  }, [autoStart, initialRepo, onLoadGitHub, run]);

  const moveTab = (event: KeyboardEvent): void => {
    const index = TABS.findIndex((t) => t.id === tab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const next = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : index + step;
    if (next === index && step === 0 && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const target = TABS[(next + TABS.length) % TABS.length];
    if (target === undefined) return;
    setTab(target.id);
    tabRefs.current[target.id]?.focus();
  };

  return (
    <div className="load-backdrop">
      <div
        className="hud-panel load-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="load-head">
          <h2 id="load-title" className="hud-title">Summon your own dungeon</h2>
          <button type="button" className="hud-close" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {state.status === "success" ? (
          <LoadSummaryView outcome={state.outcome} onDone={onClose} />
        ) : (
          <>
            <div className="load-tabs" role="tablist" aria-label="Code source" onKeyDown={moveTab}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  ref={(el) => { tabRefs.current[t.id] = el; }}
                  type="button"
                  role="tab"
                  id={`load-tab-${t.id}`}
                  className="load-tab"
                  aria-selected={tab === t.id}
                  aria-controls={`load-panel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {/* Panels stay mounted so typed input survives errors and tab switches. */}
            <div role="tabpanel" id="load-panel-paste" aria-labelledby="load-tab-paste" hidden={tab !== "paste"}>
              <PasteTab busy={busy} onSubmit={(c) => void run(() => onLoad(c))} />
            </div>
            <div role="tabpanel" id="load-panel-upload" aria-labelledby="load-tab-upload" hidden={tab !== "upload"}>
              <UploadTab busy={busy} onSubmit={(read) => void run(async () => onLoad(await read()))} />
            </div>
            <div role="tabpanel" id="load-panel-github" aria-labelledby="load-tab-github" hidden={tab !== "github"}>
              <GitHubTab busy={busy} initialRepo={initialRepo} onSubmit={(ref) => void run(() => onLoadGitHub(ref))} />
            </div>
            {busy && <p className="hud-empty" role="status">Summoning the dungeon…</p>}
            {state.status === "error" && <p className="hud-hint load-error" role="alert">{state.message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
