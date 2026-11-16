import { useState } from "react";
import type { InfraShieldAdapter } from "../../adapter.ts";
import { formatBugfixSpec, blastLabel } from "./bugfixSpecFormat.ts";
import {
  CARD, HEADER, BTN_ACTIVE, BTN_DISABLED,
  OUTPUT_BOX, COPY_BTN, ERROR_BOX, DIM,
} from "./bugfixSpecStyles.ts";

// Re-export helpers so the PBT test file can import them from this module path.
export { formatBugfixSpec, blastLabel };

// Derive BugfixSpec from the adapter's return type — no direct core import needed.
type BugfixSpec = ReturnType<InfraShieldAdapter["generateBugfixSpec"]>;

// --- Types ---

/** Structural interface: only the method BugfixSpecButton actually calls. */
export interface BugfixSpecProvider {
  generateBugfixSpec: () => BugfixSpec;
}

interface Props {
  readonly adapter:   BugfixSpecProvider;
  readonly isEnabled: boolean;
}

type Status = "idle" | "loading" | "done" | "error";

// --- Component ---

export function BugfixSpecButton({ adapter, isEnabled }: Props) {
  const [status,  setStatus]  = useState<Status>("idle");
  const [output,  setOutput]  = useState<string>("");
  const [error,   setError]   = useState<string>("");
  const [copied,  setCopied]  = useState(false);
  const [open,    setOpen]    = useState(true);

  function handleGenerate(): void {
    if (!isEnabled || status === "loading") return;
    setStatus("loading");
    setError("");

    try {
      const spec = adapter.generateBugfixSpec();
      const text = formatBugfixSpec(spec);
      setOutput(text);
      setOpen(true);
      setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
    }
  }

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const btnStyle = isEnabled ? BTN_ACTIVE : BTN_DISABLED;
  const label    = status === "loading" ? "Generating…" : "Generate Bugfix Spec";

  return (
    <div style={CARD}>
      <div style={HEADER}>Bugfix Spec</div>

      <button
        style={btnStyle}
        disabled={!isEnabled || status === "loading"}
        onClick={handleGenerate}
        aria-busy={status === "loading"}
      >
        {label}
      </button>

      {!isEnabled && (
        <div style={{ ...DIM, marginTop: 6 }}>
          Inject a fault first to enable this action.
        </div>
      )}

      {status === "error" && (
        <div style={ERROR_BOX} role="alert">
          ✖ {error}
        </div>
      )}

      {status === "done" && output !== "" && (
        <>
          <div
            style={{ ...DIM, marginTop: 8, cursor: "pointer", userSelect: "none" }}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "▾" : "▸"} spec output
          </div>

          {open && (
            <>
              <div style={OUTPUT_BOX}>{output}</div>
              <button style={COPY_BTN} onClick={() => void handleCopy()}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
