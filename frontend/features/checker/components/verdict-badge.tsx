import { TONE_COLOR, type Tone } from "@/features/checker/verdict";

/** Verdict name as a pill. The dot repeats the color, but the label always carries the meaning. */
export function VerdictBadge({ tone, label }: { tone: Tone; label: string }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold"
      style={{ backgroundColor: color.soft, color: color.text }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.text }} aria-hidden />
      {label}
    </span>
  );
}
