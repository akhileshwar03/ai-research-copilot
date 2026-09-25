"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { formatDay } from "@/features/admin/components/shared";

export function ThreeHudVisualizer({
  data,
  color = "#d9793a",
  height = 240,
  mode = "bars",
}: {
  data: { label: string; value: number }[];
  color?: string;
  height?: number;
  mode?: "bars" | "scatter" | "donut";
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number } | null>(null);
  const [webglSupported] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!webglSupported) return;

    const container = mountRef.current;
    if (!container || data.length === 0) return;

    // Check prefers-reduced-motion
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const width = container.clientWidth || 600;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 18, 38);
    camera.lookAt(0, 4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Holographic Grid Floor
    const grid = new THREE.GridHelper(40, 20, new THREE.Color(color), new THREE.Color(0x333333));
    grid.position.y = -0.05;
    if (grid.material instanceof THREE.Material) {
      grid.material.opacity = 0.35;
      grid.material.transparent = true;
    }
    scene.add(grid);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(15, 30, 20);
    scene.add(dirLight);

    const primaryColor = new THREE.Color(color);

    // Group for objects to rotate
    const chartGroup = new THREE.Group();
    scene.add(chartGroup);

    const maxVal = Math.max(1, ...data.map((d) => d.value));
    const count = data.length;
    const meshMap = new Map<THREE.Object3D, { label: string; value: number }>();

    if (mode === "bars") {
      const barWidth = Math.max(0.6, Math.min(2, 28 / count));
      const spacing = barWidth * 1.5;
      const totalWidth = count * spacing;
      const startX = -totalWidth / 2 + spacing / 2;

      data.forEach((d, i) => {
        const barHeight = Math.max(0.4, (d.value / maxVal) * 14);
        const geometry = new THREE.BoxGeometry(barWidth, barHeight, barWidth);
        const material = new THREE.MeshStandardMaterial({
          color: primaryColor,
          metalness: 0.6,
          roughness: 0.2,
          emissive: primaryColor,
          emissiveIntensity: 0.2,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(startX + i * spacing, barHeight / 2, 0);
        chartGroup.add(mesh);
        meshMap.set(mesh, d);

        // Holographic wireframe outline
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }),
        );
        mesh.add(line);
      });
    } else if (mode === "donut") {
      const total = data.reduce((s, d) => s + d.value, 0) || 1;
      let curAngle = 0;
      data.slice(0, 8).forEach((d) => {
        const sliceAngle = (d.value / total) * Math.PI * 2;
        const geom = new THREE.CylinderGeometry(
          8,
          8,
          2.5,
          16,
          1,
          false,
          curAngle,
          Math.max(0.05, sliceAngle * 0.95),
        );
        const mat = new THREE.MeshStandardMaterial({
          color: primaryColor,
          metalness: 0.5,
          roughness: 0.3,
          emissive: primaryColor,
          emissiveIntensity: 0.25,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = 2;
        chartGroup.add(mesh);
        meshMap.set(mesh, d);
        curAngle += sliceAngle;
      });
    } else {
      // Scatter / floating nodes
      data.forEach((d, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = 5 + (d.value / maxVal) * 10;
        const y = Math.max(0.8, (d.value / maxVal) * 12);
        const geom = new THREE.SphereGeometry(0.6, 16, 16);
        const mat = new THREE.MeshStandardMaterial({
          color: primaryColor,
          emissive: primaryColor,
          emissiveIntensity: 0.5,
        });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        chartGroup.add(mesh);
        meshMap.set(mesh, d);
      });
    }

    // Raycasting for hover tooltip
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-999, -999);

    const onMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    renderer.domElement.addEventListener("mousemove", onMouseMove);

    // Mouse drag rotation
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseDrag = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      chartGroup.rotation.y += deltaX * 0.01;
      chartGroup.rotation.x = Math.max(-0.4, Math.min(0.8, chartGroup.rotation.x + deltaY * 0.005));
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseDrag);
    window.addEventListener("mouseup", onMouseUp);

    // Animation Loop
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (!reduceMotion && !isDragging) {
        chartGroup.rotation.y += 0.003;
      }

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(chartGroup.children, false);
      if (intersects.length > 0) {
        const item = meshMap.get(intersects[0].object);
        if (item) setHoveredPoint(item);
      } else {
        setHoveredPoint(null);
      }

      renderer.render(scene, camera);
    };

    animate();

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
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseDrag);
      window.removeEventListener("mouseup", onMouseUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [data, color, height, mode, webglSupported]);

  if (!webglSupported) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 text-center">
        <p className="text-xs text-zinc-400">WebGL unavailable on this device — falling back to 2D view.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full select-none">
      <div ref={mountRef} className="w-full cursor-grab active:cursor-grabbing" style={{ height }} />

      {/* Floating 3D Telemetry Tooltip */}
      {hoveredPoint && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-xl border border-[var(--marketing-accent)] bg-[var(--surface-1)]/95 px-3.5 py-1.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full animate-ping" style={{ backgroundColor: color }} />
            <span className="text-[12px] font-bold text-zinc-200">{formatDay(hoveredPoint.label)}:</span>
            <span className="font-data text-[13px] font-bold text-[var(--marketing-accent-text)]">
              {hoveredPoint.value.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* 3D Hint bar */}
      <div className="mt-1 flex items-center justify-between text-[10.5px] font-medium text-zinc-500">
        <span>Click &amp; drag to rotate in 3D space</span>
        <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-data text-zinc-400">WebGL 3D HUD</span>
      </div>
    </div>
  );
}
