import type { CSSProperties } from "react";

// --- Constants ---
const NECRO_URL = "https://necro-compiler.vercel.app";

const LINK: CSSProperties = {
  padding: "6px 12px", fontFamily: "monospace", fontSize: "0.75rem", color: "#58a6ff",
  background: "rgba(13, 17, 23, 0.92)", border: "1px solid #30363d", borderRadius: 4,
  textDecoration: "none",
};

/** Base URL with the current ?repo= value carried over when present. */
function withRepo(base: string): string {
  const repo = new URLSearchParams(window.location.search).get("repo");
  if (repo === null || repo === "") return base;
  const url = new URL(base);
  url.searchParams.set("repo", repo);
  return url.toString();
}

// --- Component ---
/** Link to the Necro world, preserving the loaded repository reference. */
export function SwitchWorldLink() {
  return <a href={withRepo(NECRO_URL)} style={LINK}>Switch world</a>;
}
