"use client";

import { useState } from "react";
import { put } from "@vercel/blob/client";
import { FileUp, ImageUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { FILE_ACCEPT, FILE_TYPE_LIST, FILE_TYPES, fileTypeFromName } from "@/lib/file-types";

const MAX = 5 * 1024 * 1024;

// Uploads go straight from the browser to private storage; the server then re-reads and checks the file.
export default function BookUpload({ slug, kind }: { slug: string; kind: "pdf" | "cover" }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function post(body: object) {
    const response = await fetch("/api/admin/book-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Upload failed. Try again.");
    return result;
  }
  async function upload(file: File) {
    setError(""); setStatus("");
    if (file.size > MAX) { setError(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 5 MB.`); return; }
    const fileType = kind === "pdf" ? fileTypeFromName(file.name) : null;
    if (kind === "pdf" && !fileType) { setError(`Choose a file of type: ${FILE_TYPE_LIST}.`); return; }
    if (kind === "cover" && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG or WebP image."); return; }
    setBusy(true);
    try {
      const ticket = await post({ action: "ticket", slug, kind });
      await put(ticket.pathname, file, { access: "private", token: ticket.token, contentType: kind === "pdf" ? FILE_TYPES[fileType!].contentType : file.type,
        onUploadProgress: ({ percentage }) => setStatus(`Uploading ${Math.round(percentage)}%`) });
      setStatus("Checking the file...");
      await post({ action: "finalize", slug, kind, fileType, pathname: ticket.pathname });
      setStatus(kind === "pdf" ? "File saved. Put the add-on on sale when ready." : "Cover saved.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); setStatus(""); }
    finally { setBusy(false); }
  }
  const Icon = kind === "pdf" ? FileUp : ImageUp;
  return <div className="grid gap-1">
    <label className={`btn btn-ghost w-full cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
      <Icon size={16} aria-hidden="true" />{kind === "pdf" ? "Upload file" : "Upload cover"}
      <input type="file" className="sr-only" disabled={busy} accept={kind === "pdf" ? FILE_ACCEPT : "image/jpeg,image/png,image/webp"}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload(file); }} />
    </label>
    <span className="text-[12px] text-ink-soft">{kind === "pdf" ? `${FILE_TYPE_LIST}, up to 5 MB` : "JPEG, PNG or WebP, up to 5 MB"}</span>
    {status && <p className="text-[13px] text-brand" role="status">{status}</p>}
    {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
  </div>;
}
