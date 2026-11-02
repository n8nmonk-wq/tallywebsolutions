"use client";

import { useRef } from "react";
import { useReducedMotion } from "motion/react";
import Cover from "../Cover";

// Supplied covers are finished 3D mockups; only flat artwork gets a drawn spine and page edges.
export const isFlatCover = (src: string | null) => !src || src.startsWith("data:");

export default function Book3D({ src, title, sizes, priority, tilt = true }: { src: string | null; title: string; sizes: string; priority?: boolean; tilt?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const set = (rx: number, ry: number) => { ref.current?.style.setProperty("--rx", `${rx}deg`); ref.current?.style.setProperty("--ry", `${ry}deg`); };
  return <span ref={ref} className={`book3d${isFlatCover(src) ? " flat" : ""}`}
    onPointerMove={(e) => {
      if (reduced || !tilt || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      set(((e.clientY - r.top) / r.height - 0.5) * -10, ((e.clientX - r.left) / r.width - 0.5) * 14);
    }}
    onPointerLeave={() => set(0, 0)}>
    <span className="book3d-body"><Cover src={src} title={title} sizes={sizes} priority={priority} /></span>
    <span className="book3d-shadow" aria-hidden="true" />
  </span>;
}
