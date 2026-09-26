/** The app's dark theme is the absence of `html.light-theme` (there is no `.dark` class). */
export function isDarkTheme(): boolean {
  return !document.documentElement.classList.contains("light-theme");
}

let probeContext: CanvasRenderingContext2D | null = null;

/**
 * Resolves any CSS color (including `var(--x)`, `currentColor`, `lab()` and `oklch()`)
 * to a plain `rgba(r, g, b, a)` string that SVG images, canvas and Three.js all accept.
 */
export function resolveCssColor(color: string, scope: Element = document.body): string {
  let raw = color;
  if (color.includes("var(") || color === "currentColor") {
    const probe = document.createElement("span");
    probe.style.color = color;
    scope.appendChild(probe);
    raw = getComputedStyle(probe).color;
    probe.remove();
  }
  if (!probeContext) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    probeContext = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!probeContext) return raw;
  probeContext.clearRect(0, 0, 1, 1);
  probeContext.fillStyle = "#000";
  probeContext.fillStyle = raw;
  probeContext.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probeContext.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
}

const INLINED_STYLE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "stop-color",
  "stop-opacity",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "text-transform",
] as const;

const COLOR_PROPS = new Set<string>(["fill", "stroke", "stop-color"]);

/**
 * Copies the browser's final computed styles onto a cloned SVG so it renders identically
 * when serialised on its own (Tailwind classes and CSS variables do not survive that).
 */
export function inlineComputedStyles(original: Element, clone: Element): void {
  if (original instanceof SVGElement || original instanceof HTMLElement) {
    const computed = getComputedStyle(original);
    const target = (clone as SVGElement | HTMLElement).style;
    for (const prop of INLINED_STYLE_PROPS) {
      let value = computed.getPropertyValue(prop);
      if (!value) continue;
      if (COLOR_PROPS.has(prop) && value !== "none" && !value.startsWith("url(")) {
        value = resolveCssColor(value);
      }
      target.setProperty(prop, value);
    }
  }
  const count = Math.min(original.children.length, clone.children.length);
  for (let i = 0; i < count; i++) {
    inlineComputedStyles(original.children[i], clone.children[i]);
  }
}
