"use client";

import { BookOpen, X } from "lucide-react";
import { useRef } from "react";

// Same-site samples open in a lightbox; anything else opens in a new tab.
export default function SampleViewer({ href, title }: { href: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  if (!href.startsWith("/")) return <a className="btn btn-ghost sample-btn" href={href} target="_blank" rel="noopener noreferrer"><BookOpen size={17} aria-hidden="true" /> Read a sample</a>;
  return <>
    <button type="button" className="btn btn-ghost sample-btn" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"><BookOpen size={17} aria-hidden="true" /> Read a sample</button>
    <dialog ref={dialog} className="sample-viewer" aria-label={`Sample of ${title}`} onClick={(e) => { if (e.target === dialog.current) dialog.current.close(); }}>
      <button type="button" className="round-btn qv-close" onClick={() => dialog.current?.close()} aria-label="Close sample"><X size={18} aria-hidden="true" /></button>
      <iframe src={href} title={`Sample of ${title}`} />
    </dialog>
  </>;
}
