"use client";
import { useState } from "react";
import { Check, Copy } from 'lucide-react';

export default function CopyLinkButton({ orderId }: { orderId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="btn btn-ghost text-xs py-2 px-3.5 inline-flex items-center gap-1.5"
    >
      {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      <span>{copied ? 'Copied' : 'Copy receipt link'}</span>
    </button>
  );
}
