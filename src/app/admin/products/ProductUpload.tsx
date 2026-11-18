"use client";

import { useRef, useState } from "react";
import { put } from "@vercel/blob/client";
import { CheckCircle2, FileUp, ImageUp, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { FILE_ACCEPT, FILE_TYPE_LIST, FILE_TYPES, fileTypeFromName } from "@/lib/file-types";

const MAX = 5 * 1024 * 1024;

export type Attached = { name: string; detail: string; image?: string | null } | null;

// kind "pdf" is the product file of any supported type (the name is kept for the upload API).
// Once something is attached, the upload button becomes "Replace", which asks first; the server refuses
// a new upload for an attached file or cover unless it was sent as a replacement.
// Uploads go straight from the browser to private storage; the server then re-reads and checks the file.
export default function ProductUpload({ slug, kind, attached, onSale = false }: { slug: string; kind: "pdf" | "cover"; attached: Attached; onSale?: boolean }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isFile = kind === "pdf";
  const noun = isFile ? "file" : "cover";

  async function post(body: object) {
    const response = await fetch("/api/admin/product-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Upload failed. Try again.");
    return result;
  }
  async function upload(file: File) {
    setError(""); setStatus("");
    if (file.size > MAX) { setError(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 5 MB.`); return; }
    const fileType = isFile ? fileTypeFromName(file.name) : null;
    if (isFile && !fileType) { setError(`Choose a file of type: ${FILE_TYPE_LIST}.`); return; }
    if (!isFile && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG or WebP image."); return; }
    const replace = !!attached;
    setBusy(true);
    try {
      const ticket = await post({ action: "ticket", slug, kind, replace });
      await put(ticket.pathname, file, { access: "private", token: ticket.token, contentType: isFile ? FILE_TYPES[fileType!].contentType : file.type,
        onUploadProgress: ({ percentage }) => setStatus(`Uploading ${Math.round(percentage)}%`) });
      setStatus("Checking the file...");
      await post({ action: "finalize", slug, kind, fileType, pathname: ticket.pathname, name: file.name, replace });
      setStatus(isFile ? `${file.name} saved. Put the product on sale when ready.` : "Cover saved.");
      setReplacing(false);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); setStatus(""); }
    finally { setBusy(false); }
  }
  function choose() {
    if (busy) return;
    if (attached && !replacing) {
      const warning = isFile
        ? `Replace ${attached.name}?${onSale ? " The product goes off sale until you put it on sale again." : ""}`
        : "Replace the current cover?";
      if (!window.confirm(warning)) return;
      setReplacing(true);
    }
    picker.current?.click();
  }

  const Icon = attached ? RefreshCw : isFile ? FileUp : ImageUp;
  const hint = isFile ? `${FILE_TYPE_LIST}, up to 5 MB` : "JPEG, PNG or WebP, up to 5 MB";
  return <div className="grid gap-2">
    <p className="text-sm font-medium">{isFile ? "Product file" : "Cover image"}</p>
    {attached
      ? <div className="flex items-center gap-3 rounded-2 border border-line bg-bg-2 p-3">
          {attached.image ? <img src={attached.image} alt="" className="h-12 w-16 shrink-0 rounded-1 border border-line object-cover" />
            : <CheckCircle2 size={20} className="shrink-0 text-gold" aria-hidden="true" />}
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium" title={attached.name}>{attached.name}</p>
            <p className="text-ink-soft">{attached.detail}</p>
          </div>
        </div>
      : <p className="rounded-2 border border-dashed border-line-2 p-3 text-sm text-ink-soft">{isFile ? "No file attached yet. Customers receive this file after paying." : "No cover yet. The store shows the product icon instead."}</p>}
    <button type="button" onClick={choose} disabled={busy} className="btn btn-ghost w-full">
      <Icon size={16} aria-hidden="true" />{busy ? "Uploading..." : attached ? `Replace ${noun}` : `Upload ${noun}`}
    </button>
    <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={busy}
      accept={isFile ? FILE_ACCEPT : "image/jpeg,image/png,image/webp"}
      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload(file); else setReplacing(false); }} />
    <span className="text-[12px] text-ink-soft">{hint}</span>
    {status && <p className="text-[13px] text-brand" role="status">{status}</p>}
    {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
  </div>;
}
