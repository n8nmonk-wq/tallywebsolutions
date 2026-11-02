"use client";

import { useRef, useState, type ReactNode } from "react";

export default function BookTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!tabs.length) return null;
  const move = (to: number) => { const i = (to + tabs.length) % tabs.length; setActive(i); refs.current[i]?.focus(); };
  return <div className="book-tabs">
    <div role="tablist" aria-label="About this book" className="tab-list">{tabs.map((t, i) => <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" type="button"
      id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} aria-selected={i === active} tabIndex={i === active ? 0 : -1} onClick={() => setActive(i)}
      onKeyDown={(e) => { if (e.key === "ArrowRight") move(i + 1); if (e.key === "ArrowLeft") move(i - 1); if (e.key === "Home") move(0); if (e.key === "End") move(tabs.length - 1); }}>{t.label}</button>)}</div>
    {tabs.map((t, i) => <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={i !== active} className="tab-panel">{t.content}</div>)}
  </div>;
}
