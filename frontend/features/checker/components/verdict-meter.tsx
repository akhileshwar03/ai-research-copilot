"use client";

import { useEffect, useState } from "react";

import { InfoTip } from "@/features/checker/components/info-tip";
import { TONE_COLOR, type Tone } from "@/features/checker/verdict";

const R = 52;
const HALF = Math.PI * R;

/** A half-dial with Human on the left and AI on the right. The fill grows from the end opposite the verdict and the needle
 *  rides its leading edge, so a human result sweeps right to left in green and lands at the Human end, and an AI result
 *  sweeps left to right in red and lands at the AI end. A result that is only 60% sure stops part of the way. It is only
 *  drawn for the clear verdicts; "Unsure" and "Mixed" have no honest place on a human-to-AI line. */
function Dial({ side, fillPct, color, label }: { side: "Human" | "AI"; fillPct: number; color: string; label: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    // setTimeout, not requestAnimationFrame: rAF never fires in a backgrounded tab (see ProbabilityGauge).
    const id = setTimeout(() => setShown(Math.min(1, Math.max(0, fillPct / 100))), 30);
    return () => clearTimeout(id);
  }, [fillPct]);

  const fromRight = side === "Human";
  // Where the leading edge is along the arc, 0 = Human end (left), 1 = AI end (right).
  const edge = fromRight ? 1 - shown : shown;
  const angle = -90 + edge * 180;
  return (
    <svg viewBox="0 0 130 78" role="img" aria-label={label} className="h-[72px] w-[120px] shrink-0">
      <path d="M13 65 A52 52 0 0 1 117 65" fill="none" stroke="var(--border-subtle)" strokeWidth="8" strokeLinecap="round" />
      <g transform={fromRight ? "translate(130 0) scale(-1 1)" : undefined}>
        <path
          d="M13 65 A52 52 0 0 1 117 65"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={HALF}
          strokeDashoffset={HALF * (1 - shown)}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out"
        />
      </g>
      <g
        style={{ transform: `rotate(${angle}deg)`, transformOrigin: "65px 65px" }}
        className="motion-safe:transition-transform motion-safe:duration-700 motion-safe:ease-out"
      >
        <line x1="65" y1="65" x2="65" y2="22" stroke="var(--text-primary)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <circle cx="65" cy="65" r="4.5" fill="var(--text-primary)" />
      <text x="13" y="77" textAnchor="middle" fontSize="8" fill="var(--text-muted, #a1a1aa)">
        Human
      </text>
      <text x="117" y="77" textAnchor="middle" fontSize="8" fill="var(--text-muted, #a1a1aa)">
        AI
      </text>
    </svg>
  );
}

/** The verdict as the headline: its name, one confidence number for the side it picked, and a dial.
 *
 *  The number is the model's own estimate for that side, the same figure as the Human / Mixed / AI split below,
 *  not a calibrated probability of being right, and the copy says so. It is left out for "Unsure" and "Mixed",
 *  where the model's numbers are the least reliable and a headline figure would look more certain than it is. */
export function VerdictMeter({
  label,
  tone,
  headline,
  detail,
  percent,
  side,
  capped = false,
  tip,
}: {
  label: string;
  tone: Tone;
  headline: string;
  detail: string;
  /** Whole-number confidence for the side the verdict picked, or null to show no number. */
  percent: number | null;
  side: "Human" | "AI" | null;
  /** True when the AI number was held at its cap, so it reads "95%+". */
  capped?: boolean;
  tip: string;
}) {
  const color = TONE_COLOR[tone];
  const showNumber = percent !== null && side !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-headline text-[24px] font-bold leading-tight" style={{ color: color.text }}>
            <span>{label}</span>
            <InfoTip id="verdict-tip" label="What this result means">
              {tip}
            </InfoTip>
          </h2>
          {showNumber && (
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="font-data text-[34px] font-semibold leading-none text-[var(--text-primary)]">{percent}%{capped ? "+" : ""}</span>
              <span className="text-[12px] text-zinc-400">{side === "AI" ? "AI" : "human"} confidence</span>
            </p>
          )}
        </div>
        {showNumber && side && (
          <Dial side={side} fillPct={percent ?? 0} color={color.fill} label={`Dial: ${side} confidence ${percent} percent${capped ? " or more" : ""}`} />
        )}
      </div>
      <p className="text-[14px] leading-relaxed text-zinc-300">
        {headline} {detail}
      </p>
      <p className="text-[12px] leading-relaxed text-zinc-400">
        {showNumber ? "The model's confidence, not proof. " : ""}Colours show per-sentence signals, not accusations.
      </p>
    </div>
  );
}
