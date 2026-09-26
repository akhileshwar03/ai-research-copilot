"use client";

import { useEffect, useRef, useState } from "react";
import { isDarkTheme, resolveCssColor } from "@/features/admin/lib/chart-theme";
import * as THREE from "three";
import { formatDay } from "@/features/admin/components/shared";
import { CATEGORICAL_PALETTE } from "@/features/admin/lib/types";

interface ThreeDataPoint {
  label: string;
  value: number;
  color?: string;
  percentage?: number;
}

const VALUE_RAMP = ["#14b8a6", "#f59e0b", "#e11d48"];

function valueRampColor(ratio: number): THREE.Color {
  const t = Math.min(1, Math.max(0, ratio));
  const [low, mid, high] = VALUE_RAMP.map((c) => new THREE.Color(c));
  return t < 0.5 ? low.lerp(mid, t * 2) : mid.lerp(high, (t - 0.5) * 2);
}

export function ThreeHudVisualizer({
  data,
  color = "#d9793a",
  height = 240,
  mode = "bars",
}: {
  data: ThreeDataPoint[];
  color?: string;
  height?: number;
  mode?: "bars" | "donut" | "ribbon";
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ThreeDataPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [webglSupported] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const canvas = document.createElement("canvas");
      return Boolean(
        window.WebGLRenderingContext &&
          (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!webglSupported) return;
    const container = mountRef.current;
    if (!container || data.length === 0) return;

    // Check system preference for reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const width = container.clientWidth || 600;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    const defaultCamPos = new THREE.Vector3(0, 16, 36);
    const defaultTarget = new THREE.Vector3(0, 3, 0);
    camera.position.copy(defaultCamPos);
    camera.lookAt(defaultTarget);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Floor grid
    const isDark = isDarkTheme();
    const baseColor = resolveCssColor(color);
    const gridColor1 = new THREE.Color(baseColor);
    const gridColor2 = new THREE.Color(isDark ? 0x27272a : 0xe4e4e7);
    const grid = new THREE.GridHelper(36, 18, gridColor1, gridColor2);
    grid.position.y = -0.05;
    if (grid.material instanceof THREE.Material) {
      grid.material.opacity = isDark ? 0.35 : 0.45;
      grid.material.transparent = true;
    }
    scene.add(grid);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, isDark ? 0.8 : 1.1);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, isDark ? 1.4 : 1.6);
    mainLight.position.set(16, 28, 20);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, isDark ? 0.5 : 0.7);
    fillLight.position.set(-16, 14, -16);
    scene.add(fillLight);

    const chartGroup = new THREE.Group();
    scene.add(chartGroup);

    const maxVal = Math.max(1, ...data.map((d) => d.value));
    const count = data.length;
    const meshMap = new Map<THREE.Object3D, { data: ThreeDataPoint; baseY: number; dirVec?: THREE.Vector3 }>();

    if (mode === "bars") {
      const barWidth = Math.max(0.6, Math.min(1.8, 24 / count));
      const spacing = barWidth * 1.5;
      const totalWidth = count * spacing;
      const startX = -totalWidth / 2 + spacing / 2;

      data.forEach((d, i) => {
        const barHeight = Math.max(0.4, (d.value / maxVal) * 11);
        const geometry = new THREE.BoxGeometry(barWidth, barHeight, barWidth);
        const ratio = d.value / maxVal;
        const barColor = d.color ? new THREE.Color(resolveCssColor(d.color)) : valueRampColor(ratio);

        const material = new THREE.MeshStandardMaterial({
          color: barColor,
          metalness: 0.25,
          roughness: 0.3,
          emissive: barColor,
          emissiveIntensity: 0.15 + ratio * 0.15,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const baseY = barHeight / 2;
        mesh.position.set(startX + i * spacing, baseY, 0);
        chartGroup.add(mesh);

        // Edge wireframe for clean definition
        const edges = new THREE.EdgesGeometry(geometry);
        const edgeLine = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: isDark ? 0xffffff : 0x000000,
            transparent: true,
            opacity: isDark ? 0.25 : 0.15,
          }),
        );
        mesh.add(edgeLine);

        meshMap.set(mesh, { data: d, baseY });
      });
    } else if (mode === "donut") {
      // 3D Cylinder Donut for compositions with individual slice colors
      const total = data.reduce((s, d) => s + d.value, 0) || 1;
      let startAngle = 0;
      const innerRadius = 4.2;
      const outerRadius = 8.0;
      const depth = 2.4;

      data.slice(0, 10).forEach((d, i) => {
        const sliceAngle = (d.value / total) * Math.PI * 2;
        if (sliceAngle < 0.02) return;

        // Create 2D arc shape and extrude
        const shape = new THREE.Shape();
        const midAngle = startAngle + sliceAngle / 2;
        const eps = 0.02; // Gap between slices
        const a1 = startAngle + eps / 2;
        const a2 = startAngle + sliceAngle - eps / 2;

        shape.absarc(0, 0, outerRadius, a1, a2, false);
        shape.absarc(0, 0, innerRadius, a2, a1, true);
        shape.closePath();

        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
          depth: depth,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.12,
          bevelThickness: 0.12,
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.center();

        const sliceColor = d.color
          ? new THREE.Color(d.color)
          : new THREE.Color(CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]);

        const material = new THREE.MeshStandardMaterial({
          color: sliceColor,
          metalness: 0.2,
          roughness: 0.35,
          emissive: sliceColor,
          emissiveIntensity: 0.2,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI / 2; // Lay flat on floor
        mesh.position.y = 2.0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        chartGroup.add(mesh);

        const dirVec = new THREE.Vector3(Math.cos(midAngle), 0, Math.sin(midAngle));
        meshMap.set(mesh, {
          data: { ...d, percentage: Math.round((d.value / total) * 1000) / 10 },
          baseY: 2.0,
          dirVec,
        });

        startAngle += sliceAngle;
      });
    } else {
      // 3D Ribbon path
      const points: THREE.Vector3[] = [];
      const totalWidth = 24;
      const startX = -totalWidth / 2;
      const stepX = totalWidth / Math.max(1, count - 1);

      data.forEach((d, i) => {
        const y = Math.max(0.4, (d.value / maxVal) * 10);
        points.push(new THREE.Vector3(startX + i * stepX, y, 0));
      });

      const curve = new THREE.CatmullRomCurve3(points);
      const tubeGeom = new THREE.TubeGeometry(curve, Math.max(20, count * 3), 0.35, 8, false);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColor),
        metalness: 0.4,
        roughness: 0.2,
        emissive: new THREE.Color(baseColor),
        emissiveIntensity: 0.3,
      });
      const mesh = new THREE.Mesh(tubeGeom, mat);
      mesh.castShadow = true;
      chartGroup.add(mesh);

      // Node markers along ribbon
      data.forEach((d, i) => {
        const pt = points[i];
        const nodeGeom = new THREE.SphereGeometry(0.5, 16, 16);
        const nodeMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(baseColor),
          emissive: new THREE.Color(baseColor),
          emissiveIntensity: 0.4,
        });
        const nodeMesh = new THREE.Mesh(nodeGeom, nodeMat);
        nodeMesh.position.copy(pt);
        chartGroup.add(nodeMesh);
        meshMap.set(nodeMesh, { data: d, baseY: pt.y });
      });
    }

    // Raycasting for interactive hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);
    let activeMesh: THREE.Object3D | null = null;
    let originalColor: THREE.Color | null = null;

    const onMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      const x = Math.max(12, Math.min(rect.width - 190, event.clientX - rect.left + 12));
      const y = Math.max(8, event.clientY - rect.top - 48);
      setTooltipPos({ x, y });
    };

    const onMouseLeave = () => {
      mouse.set(-999, -999);
      if (activeMesh && meshMap.has(activeMesh)) {
        const item = meshMap.get(activeMesh)!;
        activeMesh.position.y = item.baseY;
        if (item.dirVec) {
          activeMesh.position.x = 0;
          activeMesh.position.z = 0;
        }
        if (activeMesh instanceof THREE.Mesh && originalColor) {
          (activeMesh.material as THREE.MeshStandardMaterial).emissive.copy(originalColor);
          (activeMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
        }
      }
      activeMesh = null;
      setHoveredPoint(null);
    };

    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("mouseleave", onMouseLeave);

    // Orbit Drag with Inertia Damping (NO auto-spin!)
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let velX = 0;
    let velY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      velX = 0;
      velY = 0;
    };

    const onWindowMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      velY = deltaX * 0.007;
      velX = deltaY * 0.004;

      chartGroup.rotation.y += velY;
      chartGroup.rotation.x = Math.max(-0.5, Math.min(0.85, chartGroup.rotation.x + velX));
    };

    const onWindowMouseUp = () => {
      isDragging = false;
    };

    // Wheel zoom
    let currentZoom = camera.position.length();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.03;
      currentZoom = Math.max(16, Math.min(65, currentZoom + zoomDelta));
      const dir = camera.position.clone().normalize();
      camera.position.copy(dir.multiplyScalar(currentZoom));
    };

    // Double-click reset
    const onDoubleClick = () => {
      chartGroup.rotation.set(0, 0, 0);
      velX = 0;
      velY = 0;
      camera.position.copy(defaultCamPos);
      camera.lookAt(defaultTarget);
      currentZoom = defaultCamPos.length();
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("dblclick", onDoubleClick);

    // Render loop paused when offscreen or tab hidden
    let isVisible = true;
    let animId = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isVisible) return;

      // Apply inertia damping when not actively dragging
      if (!isDragging && !prefersReducedMotion) {
        if (Math.abs(velY) > 0.0001 || Math.abs(velX) > 0.0001) {
          chartGroup.rotation.y += velY;
          chartGroup.rotation.x = Math.max(-0.5, Math.min(0.85, chartGroup.rotation.x + velX));
          velY *= 0.90;
          velX *= 0.90;
        }
      }

      // Raycast hover detection
      raycaster.setFromCamera(mouse, camera);
      const objectsToTest = Array.from(meshMap.keys());
      const intersects = raycaster.intersectObjects(objectsToTest, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object;
        if (hit !== activeMesh) {
          // Reset previous active mesh
          if (activeMesh && meshMap.has(activeMesh)) {
            const prevItem = meshMap.get(activeMesh)!;
            activeMesh.position.y = prevItem.baseY;
            if (prevItem.dirVec) {
              activeMesh.position.x = 0;
              activeMesh.position.z = 0;
            }
            if (activeMesh instanceof THREE.Mesh && originalColor) {
              (activeMesh.material as THREE.MeshStandardMaterial).emissive.copy(originalColor);
              (activeMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
            }
          }

          // Activate new hit
          activeMesh = hit;
          const hitItem = meshMap.get(hit)!;
          setHoveredPoint(hitItem.data);

          if (hit instanceof THREE.Mesh) {
            const mat = hit.material as THREE.MeshStandardMaterial;
            originalColor = mat.emissive.clone();
            mat.emissive.setHex(0xffffff);
            mat.emissiveIntensity = 0.55;

            // Elevation highlight in 3D
            if (hitItem.dirVec) {
              // Pop out along normal for donut
              hit.position.x = hitItem.dirVec.x * 1.1;
              hit.position.z = hitItem.dirVec.z * 1.1;
              hit.position.y = hitItem.baseY + 0.4;
            } else {
              hit.position.y = hitItem.baseY + 1.2;
            }
          }
        }
      } else {
        if (activeMesh && meshMap.has(activeMesh)) {
          const prevItem = meshMap.get(activeMesh)!;
          activeMesh.position.y = prevItem.baseY;
          if (prevItem.dirVec) {
            activeMesh.position.x = 0;
            activeMesh.position.z = 0;
          }
          if (activeMesh instanceof THREE.Mesh && originalColor) {
            (activeMesh.material as THREE.MeshStandardMaterial).emissive.copy(originalColor);
            (activeMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2;
          }
        }
        activeMesh = null;
        setHoveredPoint(null);
      }

      renderer.render(scene, camera);
    };

    animate();

    // IntersectionObserver to pause rendering when offscreen
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting && !document.hidden;
    });
    observer.observe(container);

    // Tab visibility listener
    const onVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 600;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mouseleave", onMouseLeave);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);

      // Deep clean Three.js resources to prevent memory leaks
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [data, color, height, mode, webglSupported]);

  if (!webglSupported) {
    return (
      <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 text-center">
        <p className="text-xs font-medium text-zinc-500">
          WebGL acceleration is unavailable on this browser or device. 2D projection is recommended.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full select-none">
      <div
        ref={mountRef}
        className="w-full cursor-grab active:cursor-grabbing"
        style={{ height }}
        title="Click & drag to orbit, scroll to zoom, double-click to reset"
      />

      {/* Dynamic 3D Telemetry Tooltip */}
      {hoveredPoint && tooltipPos && (
        <div
          className="pointer-events-none absolute z-20 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)]/95 px-3.5 py-2 shadow-2xl backdrop-blur-md transition-all"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: hoveredPoint.color || color }}
            />
            <span className="text-[12px] font-bold text-[var(--text-primary)]">
              {hoveredPoint.label.includes("-") ? formatDay(hoveredPoint.label) : hoveredPoint.label}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 font-data">
            <span className="text-[14px] font-bold text-[var(--text-primary)]">
              {hoveredPoint.value.toLocaleString()}
            </span>
            {hoveredPoint.percentage !== undefined && (
              <span className="text-[11px] font-semibold text-zinc-400">
                ({hoveredPoint.percentage}%)
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3D Interaction Control HUD Bar */}
      <div className="mt-1 flex items-center justify-between text-[11px] font-medium text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span>Drag to orbit</span>
          <span className="text-zinc-600">·</span>
          <span>Scroll to zoom</span>
          <span className="text-zinc-600">·</span>
          <span>Double-click to reset</span>
        </span>
        <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 font-data text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          WebGL 3D Engine
        </span>
      </div>
    </div>
  );
}
