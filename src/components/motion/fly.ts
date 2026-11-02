export type Box = { left: number; top: number; width: number; height: number };

export function flightKeyframes(from: Box, to: Box): Keyframe[] {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const scale = Math.round(Math.max(0.08, Math.min(1, to.width / Math.max(from.width, 1))) * 100) / 100;
  return [
    { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
    { transform: `translate(${Math.round(dx * 0.55)}px, ${Math.round(dy * 0.35 - 80)}px) scale(${Math.round(((1 + scale) / 2) * 100) / 100})`, opacity: 0.95, offset: 0.55 },
    { transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${scale})`, opacity: 0.25 },
  ];
}

// The cover the reader chose flies into the bag; the bag pulses as it lands.
export function flyToBag(source: Element | null | undefined) {
  if (typeof window === "undefined" || !source) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = document.getElementById("bag-target");
  const img = source.querySelector("img");
  if (!target || !img || typeof img.animate !== "function") return;
  const from = img.getBoundingClientRect();
  const ghost = img.cloneNode() as HTMLImageElement;
  ghost.src = img.currentSrc || img.src;
  ghost.removeAttribute("srcset");
  ghost.removeAttribute("sizes");
  Object.assign(ghost.style, { position: "fixed", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    margin: "0", zIndex: "80", pointerEvents: "none", objectFit: "contain" });
  ghost.setAttribute("aria-hidden", "true");
  ghost.alt = "";
  document.body.appendChild(ghost);
  ghost.animate(flightKeyframes(from, target.getBoundingClientRect()), { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" })
    .finished.catch(() => {}).finally(() => ghost.remove());
  target.animate([{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 320, delay: 560 });
}
