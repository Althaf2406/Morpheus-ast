import type { CSSProperties } from "react";
import { HUB_URL_CONSTANT } from "./hubUrl.ts";

// --- Styles ---
const LINK: CSSProperties = {
  padding: "6px 12px", fontFamily: "monospace", fontSize: "0.75rem", color: "#58a6ff",
  background: "rgba(13, 17, 23, 0.92)", border: "1px solid #30363d", borderRadius: 4,
  textDecoration: "none",
};

/** Hub URL with the current ?repo= value carried over when present. */
function hubHref(): string {
  const repo = new URLSearchParams(window.location.search).get("repo");
  if (repo === null || repo === "") return HUB_URL_CONSTANT;
  const url = new URL(HUB_URL_CONSTANT);
  url.searchParams.set("repo", repo);
  return url.toString();
}

// --- Component ---
/** Link back to the landing hub. */
export function HubLink() {
  return <a href={hubHref()} style={LINK}>Hub</a>;
}
