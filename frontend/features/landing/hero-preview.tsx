"use client";

import { useRef, useState } from "react";

import { HERO_CHIPS } from "@/features/landing/hero-content";
import { LiveDemoWidget } from "@/features/landing/live-demo-widget";
import {
  AICheckerDemoWidget,
  HumanizerDemoWidget,
  PaperAnalyzerDemoWidget,
  RealtimeDemoWidget,
} from "@/features/landing/product-demo-widgets";
import { PRODUCTS } from "@/features/landing/products";
import { Tilt3D } from "@/features/shared/motion/motion";

const DEMOS: Record<string, () => React.JSX.Element> = {
  "Research Copilot": LiveDemoWidget,
  Humanizer: HumanizerDemoWidget,
  "AI Checker": AICheckerDemoWidget,
  "Real-time AI": RealtimeDemoWidget,
  "Paper Analyzer": PaperAnalyzerDemoWidget,
};

/**
 * A live preview of all five tools. It changes only when the visitor picks a tab: auto-rotating panels
 * hide content (NN/g found users missing offers on a 5-second rotation) and WCAG 2.2.2 requires a way to
 * stop auto-moving content. Tabs are keyboard-operable (arrow keys, Home, End).
 */
export function HeroPreview() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const product = PRODUCTS[active];
  const Demo = DEMOS[product.name];
  const chips = HERO_CHIPS[product.name];

  const select = (i: number) => {
    const next = (i + PRODUCTS.length) % PRODUCTS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") select(active + 1);
    else if (e.key === "ArrowLeft") select(active - 1);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(PRODUCTS.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div className="relative flex flex-col items-center lg:items-end">
      <div role="tablist" aria-label="Preview a Querex tool" onKeyDown={onKeyDown} className="mb-4 flex max-w-full flex-wrap justify-center gap-1.5 lg:justify-end">
        {PRODUCTS.map((p, i) => {
          const selected = i === active;
          return (
            <button
              key={p.name}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`hero-tab-${i}`}
              aria-selected={selected}
              aria-controls="hero-preview-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={[
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                selected ? "bg-white shadow-sm" : "border-transparent bg-white/50 text-zinc-500 hover:bg-white/80 hover:text-zinc-800",
              ].join(" ")}
              style={selected ? { borderColor: p.accentSoft, color: p.accentText } : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.accent }} />
              {p.name}
            </button>
          );
        })}
      </div>

      <div className="relative flex w-full justify-center lg:justify-end" style={{ perspective: "1100px" }}>
        <div className="glass-card animate-float-slower absolute -left-10 top-2 z-0 hidden rotate-[-6deg] px-3.5 py-2.5 lg:block" aria-hidden>
          <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: product.accentText }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: product.accent }} />
            {chips[0]}
          </div>
        </div>
        <div className="glass-card animate-float-slow absolute -bottom-12 right-6 z-20 hidden rotate-[5deg] px-3.5 py-2.5 lg:block" aria-hidden>
          <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            {chips[1]}
          </div>
        </div>

        <Tilt3D className="relative z-10 w-full max-w-[440px]">
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-zinc-400 lg:text-right">
            {product.name}, live preview
          </p>
          <div id="hero-preview-panel" role="tabpanel" aria-labelledby={`hero-tab-${active}`} className="min-h-[360px]">
            <Demo key={product.name} />
          </div>
        </Tilt3D>
      </div>
    </div>
  );
}
