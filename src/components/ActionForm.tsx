"use client";
import { useState, type FormEvent, type ComponentProps } from "react";
import { useRouter } from "next/navigation";

// Admin forms that post without leaving the page. After a save they say so; a "new record" form (empty id)
// is cleared and closed, so a second click cannot create a duplicate.
export default function ActionForm({ children, ...props }: ComponentProps<"form"> & { action: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const deleting = submitter instanceof HTMLButtonElement && submitter.value === "delete";
    if (deleting && !window.confirm("Delete this permanently? This cannot be undone.")) return;
    setBusy(true); setError(""); setDone("");
    try {
      const body = new FormData(form);
      if (submitter instanceof HTMLButtonElement && submitter.name) body.set(submitter.name, submitter.value);
      const response = await fetch(props.action, { method: "POST", body });
      if (!response.ok) {
        // Error pages (413, 500) are HTML, not JSON; show a readable message either way.
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || (response.status === 413 ? "That is too large to save." : "Could not save. Try again."));
      }
      const creating = !deleting && body.has("id") && !String(body.get("id"));
      if (creating) { form.reset(); form.closest("details")?.removeAttribute("open"); }
      setDone(deleting ? "Deleted." : creating ? "Created. It is listed below." : "Saved.");
      if (response.redirected) router.push(new URL(response.url).pathname + new URL(response.url).search);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save. Try again."); }
    finally { setBusy(false); }
  }
  return <form {...props} method="post" onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={busy} className="min-w-0 grid gap-4">{children}</fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {busy && <p role="status" className="mt-3 text-sm">Saving...</p>}
    {!busy && done && <p role="status" className="mt-3 text-sm text-brand">{done}</p>}
  </form>;
}
