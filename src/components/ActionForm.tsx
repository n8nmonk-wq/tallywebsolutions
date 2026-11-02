"use client";
import { useState, type FormEvent, type ComponentProps } from "react";
import { useRouter } from "next/navigation";

export default function ActionForm({ children, ...props }: ComponentProps<"form"> & { action: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.value === "delete" && !window.confirm("Delete this record?")) return;
    setBusy(true); setError("");
    try {
      const body = new FormData(form);
      if (submitter instanceof HTMLButtonElement && submitter.name) body.set(submitter.name, submitter.value);
      const response = await fetch(props.action, { method: "POST", body });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not save. Try again.");
      }
      if (response.redirected) router.push(new URL(response.url).pathname + new URL(response.url).search);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save. Try again."); }
    finally { setBusy(false); }
  }
  return <form {...props} method="post" onSubmit={submit} aria-busy={busy}>
    <fieldset disabled={busy} className="min-w-0 grid gap-4">{children}</fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {busy && <p role="status" className="mt-3 text-sm">Saving...</p>}
  </form>;
}
