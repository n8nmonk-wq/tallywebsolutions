"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import Cover from "../Cover";
import { rupees } from "@/lib/money";

export type ShelfItem = { slug: string; title: string; cover: string | null; price: number; regular: number; onSale: boolean; saleable: boolean };

// The shelf repeats the add-ons three times, so the row never runs out in either direction.
const COPIES = 3;
const TONES = ["navy", "oxblood", "forest", "cream"] as const;

const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
// Smooth step that lets neighbours slide apart as the open tape takes room.
const bend = (r: number) => (Math.abs(r) < 1 ? (r + Math.sin(Math.PI * r) / Math.PI) / 2 : Math.sign(r) * 0.5);
// Signed offset of tape v from the scroll position s, wrapped into one loop.
const offset = (v: number, s: number, loop: number) => {
  let r = (((v - s) % loop) + loop) % loop;
  if (r > loop / 2) r -= loop;
  return r;
};

// Add-on shelf: each tape is a box with a spine face and a cover face. One animation loop moves the
// shelf with a spring; the tape at the centre turns out of its spine and leans towards the cursor.
export default function AddOnShelf({ items }: { items: ShelfItem[] }) {
  const router = useRouter();
  const n = items.length;
  const loop = n * COPIES;
  const stageRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const tapes = useRef<(HTMLDivElement | null)[]>([]);
  const lifts = useRef<number[]>([]);
  const [active, setActive] = useState(0);
  const st = useRef({
    s: n, T: n, W: 800, H: 300, ws: 50, d: 200, gap: 9, active: 0, hover: -1,
    tiltX: 0, tiltY: 0, mx: 0, my: 0, pointerDown: false, dragging: false, moved: false,
    startX: 0, startT: 0, wheelTimer: undefined as number | undefined,
  });

  useEffect(() => {
    const S = st.current;
    const stage = stageRef.current;
    if (!n || !stage) return;
    const layout = () => {
      const W = stage.clientWidth;
      const mobile = window.innerWidth < 768;
      const raw = mobile ? Math.min(window.innerWidth * 0.6, window.innerHeight * 0.4) : Math.min(window.innerHeight * 0.46, window.innerWidth * 0.31);
      const H = Math.max(180, Math.min(360, raw));
      const ws = H * 0.169, d = H * 0.667, gap = H * 0.03;
      Object.assign(S, { W, H, ws, d, gap });
      stage.style.setProperty("--H", `${H}px`);
      stage.style.setProperty("--ws", `${ws}px`);
      stage.style.setProperty("--d", `${d}px`);
    };
    layout();

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const host = captionRef.current;
    // The caption is a stack of title lines in one grid cell; a change rolls the new line up through the mask.
    const swapCaption = (index: number, dir: number) => {
      if (!host) return;
      const line = document.createElement("span");
      line.className = "shelf-line";
      line.textContent = items[index].title;
      host.appendChild(line);
      const timing = { duration: reduced ? 1 : 650, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" as const };
      line.animate([{ transform: `translateY(${dir * 105}%)` }, { transform: "translateY(0)" }], timing);
      Array.from(host.children).forEach((old) => {
        if (old === line || (old as HTMLElement).dataset.leaving) return;
        (old as HTMLElement).dataset.leaving = "1";
        const from = getComputedStyle(old).transform;
        const anim = old.animate([{ transform: from === "none" ? "translateY(0)" : from }, { transform: `translateY(${-dir * 105}%)` }], timing);
        anim.onfinish = () => old.remove();
      });
    };
    if (host && !host.childElementCount) {
      const first = document.createElement("span");
      first.className = "shelf-line";
      first.textContent = items[0].title;
      host.appendChild(first);
    }

    let raf = 0;
    let prev = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000 || 0.016);
      prev = now;
      const k = reduced ? 60 : S.dragging ? 18 : 5.2;
      S.s += (S.T - S.s) * (1 - Math.exp(-k * dt));
      if (Math.abs(S.T - S.s) < 1e-4) S.s = S.T;
      if (Math.abs(S.s) > 2 * loop) {
        const shift = Math.round(S.s / loop) * loop;
        S.s -= shift;
        S.T -= shift;
      }
      const idx = ((Math.round(S.s) % n) + n) % n;
      if (idx !== S.active) {
        const dir = Math.sign(S.T - S.s) || 1;
        S.active = idx;
        swapCaption(idx, dir);
        setActive(idx);
      }

      // The open cover leans towards the cursor when the cursor is over it, and drifts gently otherwise.
      const settled = Math.abs(S.T - S.s) < 0.3;
      const onCover = !S.dragging && settled && Math.abs(S.mx - S.W / 2) < 0.55 * S.d && Math.abs(S.my - S.H / 2) < 0.55 * S.H;
      const tgtY = onCover ? ((S.mx - S.W / 2) / (0.55 * S.d)) * 9 : ((S.mx - S.W / 2) / S.W) * 5;
      const tgtX = onCover ? (-(S.my - S.H / 2) / (S.H / 2)) * 6 : 0;
      const e7 = reduced ? 1 : 1 - Math.exp(-7 * dt);
      S.tiltY += (tgtY - S.tiltY) * e7;
      S.tiltX += (tgtX - S.tiltX) * e7;
      const e12 = reduced ? 1 : 1 - Math.exp(-12 * dt);

      for (let v = 0; v < loop; v++) {
        const el = tapes.current[v];
        if (!el) continue;
        const r = offset(v, S.s, loop);
        const target = v === S.hover && Math.abs(r) > 0.5 ? 1 : 0;
        const lift = (lifts.current[v] ?? 0) + (target - (lifts.current[v] ?? 0)) * e12;
        lifts.current[v] = lift;
        const x = r * (S.ws + S.gap) + (S.d - S.ws + 1.6 * S.gap) * bend(r);
        if (Math.abs(x) > S.W / 2 + 1.5 * S.d) { el.style.visibility = "hidden"; continue; }
        el.style.visibility = "visible";
        const o = smooth(1 - Math.abs(r));
        const y = -o * 0.025 * S.H - lift * 0.045 * S.H;
        const z = o * 0.2 * S.H;
        const rx = S.tiltX * o, ry = -90 * o + S.tiltY * o, rz = -4.5 * o;
        el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateZ(${rz.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
        el.style.zIndex = String(Math.round(100 - Math.abs(r) * 4));
        el.style.setProperty("--s1", (o * 0.55).toFixed(3));
        el.style.setProperty("--s2", ((1 - o) * 0.5).toFixed(3));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame((t) => { prev = t; frame(t); });

    const pointer = (e: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      S.mx = e.clientX - rect.left;
      S.my = e.clientY - rect.top;
      if (S.pointerDown && !S.dragging && Math.abs(e.clientX - S.startX) > 5) { S.dragging = true; S.moved = true; }
      if (S.dragging) S.T = S.startT - (e.clientX - S.startX) / (S.ws + S.gap);
    };
    const release = () => {
      S.pointerDown = false;
      if (S.dragging) { S.dragging = false; S.T = Math.round(S.T); }
    };
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("pointerup", release);
    window.addEventListener("resize", layout);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("resize", layout);
    };
  }, [items, n, loop]);

  if (!n) return null;
  const step = (direction: number) => { st.current.T = Math.round(st.current.T) + direction; };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const S = st.current;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    S.T += delta / (S.ws + S.gap || 1) * 0.5;
    window.clearTimeout(S.wheelTimer);
    S.wheelTimer = window.setTimeout(() => { S.T = Math.round(S.T); }, 160);
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const S = st.current;
    S.pointerDown = true;
    S.moved = false;
    S.startX = event.clientX;
    S.startT = S.T;
  };
  const onTapeClick = (v: number) => {
    const S = st.current;
    if (S.moved) return;
    const r = offset(v, S.s, loop);
    if (Math.abs(r) < 0.5) router.push(`/books/${encodeURIComponent(items[v % n].slug)}`);
    else S.T = Math.round(S.T + r);
  };
  const current = items[active];

  return <section className="shelf" aria-roledescription="carousel" aria-label="Add-ons shelf" onKeyDown={onKey}>
    <div className="shelf-stage" ref={stageRef} onWheel={onWheel} onPointerDown={onPointerDown}>
      {Array.from({ length: loop }, (_, v) => {
        const item = items[v % n];
        const tone = TONES[(v % n) % TONES.length];
        return <div key={v} ref={(el) => { tapes.current[v] = el; }} className="tape" role="button" tabIndex={-1}
          aria-label={`Show ${item.title}`} style={{ visibility: "hidden" } as CSSProperties}
          onPointerEnter={() => { st.current.hover = v; }} onPointerLeave={() => { if (st.current.hover === v) st.current.hover = -1; }}
          onClick={() => onTapeClick(v)}>
          <div className={`face spine-face tone-${tone}`}>
            {item.cover && <span className="spine-art"><Cover src={item.cover} title={item.title} sizes="80px" /></span>}
            <span className="spine-label"><span className="spine-title">{item.title}</span></span>
          </div>
          <div className="face cover-face"><Cover src={item.cover} title={item.title} sizes="300px" /></div>
        </div>;
      })}
      <span className="shelf-board" aria-hidden="true" />
    </div>
    <div className="shelf-caption">
      <div className="shelf-lines" ref={captionRef} aria-live="polite" />
      <p className="shelf-price">{current.onSale ? <><s>{rupees(current.regular)}</s> {rupees(current.price)}</> : rupees(current.price)}
        {!current.saleable && <span className="shelf-soon"> · Not yet on sale</span>}</p>
      <Link className="btn btn-primary" href={`/books/${encodeURIComponent(current.slug)}`}>View add-on <span aria-hidden="true">→</span></Link>
    </div>
    <div className="shelf-controls">
      <button type="button" className="round-btn" onClick={() => step(-1)} aria-label="Previous add-on"><ChevronLeft size={17} aria-hidden="true" /></button>
      <button type="button" className="round-btn" onClick={() => step(1)} aria-label="Next add-on"><ChevronRight size={17} aria-hidden="true" /></button>
    </div>
  </section>;
}
