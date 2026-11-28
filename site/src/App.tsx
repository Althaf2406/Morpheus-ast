import type { ReactElement } from "react";
import { BuiltWithKiro } from "./components/BuiltWithKiro";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { TryYourCode } from "./components/TryYourCode";
import { WorldCards } from "./components/WorldCard";

export function App(): ReactElement {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Hero />
      <main id="main" tabIndex={-1}>
        <WorldCards />
        <TryYourCode />
        <HowItWorks />
        <BuiltWithKiro />
      </main>
      <Footer />
    </>
  );
}
