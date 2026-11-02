"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

export default function ShareButton({ title, url }: { title: string; url: string }) {
  const [status, setStatus] = useState("");
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); setStatus("Link copied"); }
    } catch { /* The reader cancelled the share sheet. */ }
  }
  return <><button type="button" className="round-btn" onClick={share} aria-label={`Share ${title}`}><Share2 size={18} aria-hidden="true" /></button>
    <span className="sr-only" role="status">{status}</span></>;
}
