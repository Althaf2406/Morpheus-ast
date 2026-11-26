import type { GrimoireEntry } from "../spells/spellState.ts";

interface Props {
  readonly history: readonly GrimoireEntry[];
}

const VISIBLE_ENTRIES = 6;

/** Small spell history: newest first. */
export function Grimoire({ history }: Props) {
  const recent = history.slice(-VISIBLE_ENTRIES).reverse();
  return (
    <aside className="hud-panel hud-grimoire" aria-label="Grimoire, spell history">
      <h2 className="hud-title">Grimoire</h2>
      {recent.length === 0 ? (
        <p className="hud-empty">No spells cast yet.</p>
      ) : (
        <ol className="hud-list" aria-live="polite">
          {recent.map((entry) => (
            <li key={entry.id} className={entry.undone ? "hud-entry hud-entry--undone" : "hud-entry"}>
              <span className="hud-entry__name">{entry.title}</span>
              <span className="hud-code">{entry.filePath}</span>
              <span className="hud-entry__meta">
                {entry.splicesApplied} {entry.splicesApplied === 1 ? "splice" : "splices"}
                {entry.undone && <strong> · undone</strong>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
