import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoMotionProvider } from "./demo-motion";
import { LiveDemoWidget } from "./live-demo-widget";
import {
  AICheckerDemoWidget,
  HumanizerDemoWidget,
  PaperAnalyzerDemoWidget,
  RealtimeDemoWidget,
} from "./product-demo-widgets";
import { Reveal } from "@/features/shared/motion/motion";

function stubMatchMedia(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
}

const widgetText = (container: HTMLElement) => container.textContent ?? "";
// In small steps, each in its own act(): the widgets schedule their next timer from an effect, which React
// only runs when act() exits. One big advance would fire a single timer and could never catch a broken pause.
const advance = (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) act(() => void vi.advanceTimersByTime(100));
};

describe("demo pause control (WCAG 2.2.2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMatchMedia(false);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("stops the widget while paused and resumes it afterwards", () => {
    const { container } = render(
      <DemoMotionProvider>
        <LiveDemoWidget />
      </DemoMotionProvider>,
    );

    const start = widgetText(container);
    advance(4000);
    const playing = widgetText(container);
    expect(playing).not.toBe(start); // it really animates

    fireEvent.click(screen.getByRole("button", { name: /pause animations/i }));
    const frozen = widgetText(container);
    advance(8000);
    expect(widgetText(container)).toBe(frozen); // nothing moves while paused

    fireEvent.click(screen.getByRole("button", { name: /play animations/i }));
    advance(8000);
    expect(widgetText(container)).not.toBe(frozen); // and it picks up again
  });

  it.each([
    ["Research Copilot", LiveDemoWidget],
    ["Humanizer", HumanizerDemoWidget],
    ["AI Checker", AICheckerDemoWidget],
    ["Real-time AI", RealtimeDemoWidget],
    ["Paper Analyzer", PaperAnalyzerDemoWidget],
  ])("every demo obeys the pause switch: %s", (_name, Widget) => {
    const { container } = render(
      <DemoMotionProvider>
        <Widget />
      </DemoMotionProvider>,
    );
    const start = widgetText(container);
    advance(6000);
    expect(widgetText(container)).not.toBe(start); // it animates on its own

    fireEvent.click(screen.getByRole("button", { name: /pause animations/i }));
    const frozen = widgetText(container);
    advance(10000);
    expect(widgetText(container)).toBe(frozen); // and stops completely when paused

    fireEvent.click(screen.getByRole("button", { name: /play animations/i }));
    advance(10000);
    expect(widgetText(container)).not.toBe(frozen); // and resumes
  });

  it("reflects the state on the button for assistive technology", () => {
    render(
      <DemoMotionProvider>
        <div />
      </DemoMotionProvider>,
    );
    const button = screen.getByRole("button", { name: /pause animations/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /play animations/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts paused for visitors who asked their OS for reduced motion, and lets them press Play", () => {
    stubMatchMedia(true);
    render(
      <DemoMotionProvider>
        <div />
      </DemoMotionProvider>,
    );
    expect(screen.getByRole("button", { name: /play animations/i })).toBeInTheDocument();
  });
});

describe("Reveal above the fold", () => {
  it("is visible from the first paint: no JavaScript-controlled opacity, CSS-only entrance", () => {
    stubMatchMedia(false);
    const { container } = render(
      <Reveal above delay={80}>
        <h1>Headline</h1>
      </Reveal>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("reveal-above");
    expect(wrapper.style.opacity).toBe("");
    expect(wrapper.style.animationDelay).toBe("80ms");
    expect(wrapper.hasAttribute("data-reveal")).toBe(false);
  });
});
