import type { ReactElement } from "react";
import "./worldCards.css";

export type WorldVariant = "necro" | "infra";

export interface WorldCardProps {
  variant: WorldVariant;
  name: string;
  tagline: string;
  href: string;
}

export const NECRO_URL = "https://necro-compiler.vercel.app";
export const INFRA_URL = "https://infrashield-3d.vercel.app";

function NecroArt(): ReactElement {
  return (
    <svg className="world-art" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
      <circle className="art-glow" cx="60" cy="40" r="26" fill="#c2370f" opacity="0.35" />
      <path d="M10 80V48l12-10 12 10v32M44 80V30l16-18 16 18v50M86 80V50l12-10 12 10v30" fill="#2a1710" stroke="#ff6a3d" strokeWidth="1.5" />
      <path d="M56 80V58a4 4 0 0 1 8 0v22" fill="#0e0705" />
    </svg>
  );
}

function InfraArt(): ReactElement {
  return (
    <svg className="world-art" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
      <path d="M0 70h120M0 50h120M0 30h120M20 0v80M60 0v80M100 0v80" stroke="#0b3a44" strokeWidth="1" />
      <path d="M14 70V44h14v26M46 70V20h18v50M82 70V36h16v34" fill="#06151a" stroke="#22e1ff" strokeWidth="1.5" />
      <circle className="art-glow" cx="55" cy="14" r="5" fill="#22e1ff" />
    </svg>
  );
}

export function WorldCard({ variant, name, tagline, href }: WorldCardProps): ReactElement {
  return (
    <article className={`world-card world-card--${variant}`} data-variant={variant}>
      <div className="world-art-frame">{variant === "necro" ? <NecroArt /> : <InfraArt />}</div>
      <h2 className="world-name">{name}</h2>
      <p className="world-tagline">{tagline}</p>
      <a className="world-enter" href={href} aria-label={`Enter ${name}`}>
        Enter
      </a>
    </article>
  );
}

export function WorldCards(): ReactElement {
  return (
    <section className="world-split" aria-label="Choose a world">
      <WorldCard
        variant="necro"
        name="NECRO-COMPILER"
        tagline="Every monster is a real code smell. Every spell is a real refactor."
        href={NECRO_URL}
      />
      <WorldCard
        variant="infra"
        name="InfraShield 3D"
        tagline="Inject a fault. Watch the blast radius. Patch and roll back byte-exact."
        href={INFRA_URL}
      />
    </section>
  );
}
