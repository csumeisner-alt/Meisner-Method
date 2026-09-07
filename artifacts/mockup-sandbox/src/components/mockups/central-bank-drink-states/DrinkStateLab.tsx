import { DaiquiriGlowSurge } from "../daiquiri-redesign/DaiquiriGlowSurge";
import { Interactive as SmartProInteractive } from "../smart-pro-bottle/Interactive";

/**
 * The bottle lab intentionally composes the approved source frames directly.
 * These are reference surfaces, not a third visual interpretation: the two
 * source components own their own state, animation, responsive layout, and
 * reduced-motion behavior.
 */
export function DrinkStateLab() {
  return (
    <main className="approved-drink-lab">
      <section className="approved-reference approved-reference-daiquiri" aria-label="Approved Dave Ramsey Daiquiri reference">
        <DaiquiriGlowSurge />
      </section>
      <section className="approved-reference approved-reference-smartpro" aria-label="Approved SmartPro reference">
        <SmartProInteractive />
      </section>
      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #071321; }
        .approved-drink-lab { min-height: 100vh; background: #071321; }
        .approved-reference { width: 100%; overflow: hidden; }
        .approved-reference-daiquiri { background: #071321; }
        .approved-reference-smartpro { background: #090b0c; border-top: 1px solid rgba(103,206,158,.16); }
      `}</style>
    </main>
  );
}