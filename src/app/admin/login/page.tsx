import { redirect } from "next/navigation";
import { adminPasswordConfigured, signIn } from "@/lib/admin-auth";
import { env } from "@/lib/env";
import { STORE } from "@/lib/store";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = adminPasswordConfigured();

  async function attempt(formData: FormData) {
    "use server";
    const ok = await signIn(String(formData.get("password") || ""));
    redirect(ok ? "/admin" : "/admin/login?error=1");
  }

  return (
    <div className="wrap grid min-h-[70vh] max-w-[420px] place-content-center py-20">
      <p className="eyebrow mb-4">{STORE.name}</p>
      <h1 className="title title-lg mb-2">Admin sign in</h1>
      <hr className="gold-rule mb-8" />
      {!!env("ADMIN_EMAIL") && <Link href="/login?next=/admin" className="btn btn-primary mb-6">Sign in with email</Link>}

      {!configured ? (
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {env("ADMIN_EMAIL") ? "Use your authorised email account to continue." : "Administration is not configured on this deployment."}
        </p>
      ) : (
        <form action={attempt}>
          <label className="field-label" htmlFor="password">
            Admin password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="field-input"
            aria-describedby={error ? "login-error" : undefined}
          />
          {error && (
            <p id="login-error" role="alert" className="mt-3 text-sm text-danger">
              That password is not correct.
            </p>
          )}
          <button className="btn btn-primary mt-6 w-full justify-center" type="submit">
            Sign in
          </button>
          <p className="mt-4 text-[13px] text-ink-soft">
            Stays signed in on this browser for seven days.
          </p>
        </form>
      )}
    </div>
  );
}
