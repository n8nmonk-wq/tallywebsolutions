"use client";
import { useState, type FormEvent } from "react";
import { put } from "@vercel/blob/client";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";

export default function UploadForm({ submissionId }: { submissionId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [kind, setKind] = useState("manuscript");
  const router = useRouter();
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    setError(""); setMessage("");
    if (!(file instanceof File) || !file.size || file.size > (kind === "cover" ? 5 : 20) * 1024 * 1024) { setError(kind === "cover" ? "Choose a cover image up to 5 MB." : "Choose a PDF up to 20 MB."); return; }
    setBusy(true);
    try {
      async function post(body: object) {
        const response = await fetch("/api/submissions/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Upload failed.");
        return result;
      }
      const ticket = await post({ action: "ticket", submission_id: submissionId, kind });
      await put(ticket.pathname, file, { access: "private", token: ticket.token, multipart: true,
        contentType: kind === "cover" ? file.type : "application/pdf",
        onUploadProgress: ({ percentage }) => setMessage(`Uploading ${Math.round(percentage)}%`) });
      setMessage("Validating upload...");
      await post({ action: "finalize", ticket_id: ticket.ticket_id });
      setMessage("Upload received. Scan pending."); form.reset(); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Upload failed."); setMessage(""); }
    finally { setBusy(false); }
  }
  return <form onSubmit={upload} className="mt-4 border-t border-line pt-4" aria-busy={busy}>
    <fieldset disabled={busy} className="grid min-w-0 items-end gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
      <label className="text-sm">Asset<select name="kind" className="field-input mt-1" value={kind} onChange={e => setKind(e.target.value)}>
        <option value="manuscript">Manuscript</option><option value="cover">Cover</option><option value="sample">Sample</option>
      </select></label>
      <label className="min-w-0 text-sm">{kind === "cover" ? "JPEG, PNG, WebP (5 MB)" : "PDF (20 MB)"}
        <input key={kind} className="field-input mt-1 min-w-0" type="file" name="file" required accept={kind === "cover" ? "image/jpeg,image/png,image/webp" : "application/pdf"} />
      </label>
      <button type="submit" className="btn btn-ghost"><Upload size={16} aria-hidden />Upload</button>
    </fieldset>
    {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
  </form>;
}
