import { toast } from "sonner";
import { inlineComputedStyles, isDarkTheme, resolveCssColor } from "@/features/admin/lib/chart-theme";

/**
 * Safely downloads a Blob by appending an anchor to document.body,
 * clicking it, and revoking the object URL after a 1.5s delay to prevent
 * premature cancellation in modern browsers.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1500);
  } catch (err) {
    console.error("Failed to download blob:", err);
    toast.error("Download failed to trigger");
  }
}

/** Escapes a CSV cell value per RFC 4180. */
function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

interface TableExportOptions {
  filename: string;
  title: string;
  dateRange?: string;
  scope?: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
}

/**
 * Exports tabular data as a clean CSV with metadata comments and UTF-8 BOM.
 */
export function exportTableCsv({
  filename,
  title,
  dateRange,
  scope,
  headers,
  rows,
}: TableExportOptions): void {
  try {
    const lines: string[] = [];

    // Header comment block
    lines.push(`# Querex Admin Telemetry Export: ${title}`);
    if (dateRange) {
      lines.push(`# Date Range: ${dateRange} (UTC)`);
    }
    lines.push(`# User Scope: ${scope || "All Users"}`);
    lines.push(`# Exported: ${new Date().toISOString()} (UTC)`);
    lines.push("#");

    // CSV Header row
    lines.push(headers.map(escapeCsvCell).join(","));

    // CSV Data rows
    for (const row of rows) {
      lines.push(row.map(escapeCsvCell).join(","));
    }

    const csvContent = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
    toast.success("CSV export downloaded");
  } catch (err) {
    console.error("CSV export error:", err);
    toast.error("Failed to generate CSV export");
  }
}

interface ChartLegendEntry {
  label: string;
  value: string;
  color: string;
}

interface ChartPngExportOptions {
  container: HTMLElement;
  filename: string;
  title: string;
  dateRange?: string;
  scope?: string;
  legend?: ChartLegendEntry[];
}

/**
 * Captures a chart into a crisp, high-DPI 2x PNG snapshot matching the active theme's
 * surface color, complete with title, metadata, an optional legend and a watermark.
 * The chart is the container's `svg[data-chart-svg]` (2D) or its WebGL canvas (3D).
 */
export async function exportChartPng({
  container,
  filename,
  title,
  dateRange,
  scope,
  legend,
}: ChartPngExportOptions): Promise<void> {
  try {
    const chartSvg = container.querySelector<SVGSVGElement>("svg[data-chart-svg='true']");
    const webglCanvas = chartSvg ? null : container.querySelector("canvas");

    if (!webglCanvas && !chartSvg) {
      toast.error("No visual chart found to export");
      return;
    }

    const isDark = isDarkTheme();
    const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface-1").trim();
    const bgColor = surface ? resolveCssColor(surface) : isDark ? "#121110" : "#faf9f6";

    // Text colors based on theme
    const textColor = isDark ? "#f4f4f5" : "#18181b";
    const subtextColor = isDark ? "#a1a1aa" : "#71717a";
    const accentColor = "#d9793a";
    const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

    const dpr = 2; // 2x high-DPI
    const width = 1200;
    const headerHeight = 110;
    const footerHeight = 44;
    const chartAreaHeight = 600;
    const totalHeight = headerHeight + chartAreaHeight + footerHeight;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width * dpr;
    outCanvas.height = totalHeight * dpr;
    const ctx = outCanvas.getContext("2d");
    if (!ctx) throw new Error("Could not create 2D canvas context");

    ctx.scale(dpr, dpr);

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, totalHeight);

    // Decorative top border bar
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, width, 4);

    // Header: System badge & title
    ctx.fillStyle = accentColor;
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.fillText("QUEREX COMMAND CENTER · TELEMETRY SNAPSHOT", 40, 36);

    ctx.fillStyle = textColor;
    ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, 40, 68);

    // Header metadata tags (Date range, user scope)
    const metaParts = [];
    if (dateRange) metaParts.push(`Range: ${dateRange} (UTC)`);
    if (scope) metaParts.push(`Scope: ${scope}`);
    metaParts.push(`Exported: ${new Date().toISOString().slice(0, 10)} UTC`);

    ctx.fillStyle = subtextColor;
    ctx.font = "500 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(metaParts.join("   |   "), 40, 92);

    // Divider line below header
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 106);
    ctx.lineTo(width - 40, 106);
    ctx.stroke();

    const legendWidth = legend?.length ? 380 : 0;
    const plotX = 40;
    const plotW = width - 80 - legendWidth;
    const plotH = chartAreaHeight - 20;

    // Render chart graphic
    if (webglCanvas) {
      // 3D Canvas capture
      const cw = webglCanvas.width;
      const ch = webglCanvas.height;
      const aspect = cw / ch;
      let targetW = plotW;
      let targetH = targetW / aspect;
      if (targetH > plotH) {
        targetH = plotH;
        targetW = targetH * aspect;
      }
      const x = plotX + (plotW - targetW) / 2;
      const y = headerHeight + (chartAreaHeight - targetH) / 2;
      ctx.drawImage(webglCanvas, x, y, targetW, targetH);
    } else if (chartSvg) {
      // 2D SVG capture
      const clonedSvg = chartSvg.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      inlineComputedStyles(chartSvg, clonedSvg);

      const svgW = chartSvg.clientWidth || 800;
      const svgH = chartSvg.clientHeight || 400;
      clonedSvg.setAttribute("width", String(svgW));
      clonedSvg.setAttribute("height", String(svgH));

      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const aspect = svgW / svgH;
          let targetW = plotW;
          let targetH = targetW / aspect;
          if (targetH > plotH) {
            targetH = plotH;
            targetW = targetH * aspect;
          }
          const x = plotX + (plotW - targetW) / 2;
          const y = headerHeight + (chartAreaHeight - targetH) / 2;
          ctx.drawImage(img, x, y, targetW, targetH);
          URL.revokeObjectURL(svgUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          reject(new Error("Failed to rasterize chart SVG"));
        };
        img.src = svgUrl;
      });
    }

    if (legend?.length) {
      const rowH = 34;
      const listH = Math.min(legend.length, 14) * rowH;
      const lx = width - 40 - legendWidth + 24;
      let ly = headerHeight + (chartAreaHeight - listH) / 2 + 12;
      for (const entry of legend.slice(0, 14)) {
        ctx.fillStyle = resolveCssColor(entry.color);
        ctx.beginPath();
        ctx.roundRect(lx, ly - 12, 14, 14, 3);
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.font = "600 15px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(entry.label.length > 22 ? `${entry.label.slice(0, 21)}…` : entry.label, lx + 26, ly);
        ctx.fillStyle = subtextColor;
        ctx.textAlign = "right";
        ctx.fillText(entry.value, lx + legendWidth - 48, ly);
        ly += rowH;
      }
      ctx.textAlign = "left";
    }

    // Divider line above footer
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, totalHeight - footerHeight);
    ctx.lineTo(width - 40, totalHeight - footerHeight);
    ctx.stroke();

    // Footer: Watermark
    ctx.fillStyle = subtextColor;
    ctx.font = "11px system-ui, -apple-system, sans-serif";
    ctx.fillText("Querex Platform Analytics · High-DPI Lossless Export", 40, totalHeight - 16);
    ctx.textAlign = "right";
    ctx.fillText("All timestamps & bounds in UTC", width - 40, totalHeight - 16);
    ctx.textAlign = "left";

    // Download PNG
    outCanvas.toBlob((blob) => {
      if (!blob) {
        toast.error("Failed to generate image file");
        return;
      }
      downloadBlob(blob, filename.endsWith(".png") ? filename : `${filename}.png`);
      toast.success("Chart snapshot downloaded");
    }, "image/png");
  } catch (err) {
    console.error("Chart export failed:", err);
    toast.error("Failed to export chart image");
  }
}
