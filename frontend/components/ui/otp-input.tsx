"use client";

import { useRef } from "react";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: () => void;
  length?: number;
  disabled?: boolean;
}

export function OtpInput({ value, onChange, onComplete, length = 6, disabled = false }: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, char: string) => {
    const sanitized = char.replace(/\D/g, "").slice(-1);
    const chars = value.split("").slice(0, length);
    while (chars.length < length) chars.push("");
    chars[index] = sanitized;
    onChange(chars.join(""));
    if (sanitized && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    // Trigger onComplete when last digit is filled
    const newVal = value.split("").slice(0, length);
    while (newVal.length < length) newVal.push("");
    newVal[index] = sanitized;
    if (index === length - 1 && newVal.every(Boolean)) {
      onComplete?.();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!value[index] && index > 0) {
        const chars = value.split("").slice(0, length);
        while (chars.length < length) chars.push("");
        chars[index - 1] = "";
        onChange(chars.join(""));
        inputsRef.current[index - 1]?.focus();
      } else {
        const chars = value.split("").slice(0, length);
        while (chars.length < length) chars.push("");
        chars[index] = "";
        onChange(chars.join(""));
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    const chars = pasted.split("");
    while (chars.length < length) chars.push("");
    onChange(chars.join(""));
    const lastFilled = Math.min(pasted.length, length - 1);
    inputsRef.current[lastFilled]?.focus();
  };

  return (
    <div className="flex gap-2.5" onPaste={handlePaste}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          className={[
            "h-14 w-12 rounded-xl border text-center text-xl font-mono font-semibold",
            "bg-[#111] outline-none transition-all duration-150",
            "disabled:cursor-not-allowed disabled:opacity-40",
            value[i]
              ? "border-white/30 text-white ring-1 ring-white/10"
              : "border-white/[0.08] text-zinc-400",
            "focus:border-white/40 focus:ring-1 focus:ring-white/20 focus:text-white",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
