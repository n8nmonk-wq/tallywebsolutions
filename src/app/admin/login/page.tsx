import { redirect } from "next/navigation";
import { adminSignInConfigured, signIn } from "@/lib/admin-auth";
import { STORE } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const configured = adminSignInConfigured();

  async function attempt(formData: FormData) {
    "use server";
    const ok = await signIn(String(formData.get("email") || ""), String(formData.get("password") || ""));
    redirect(ok ? "/admin" : "/admin/login?error=1");
  }

  return (
    <div className="wrap grid min-h-[70vh] max-w-[420px] place-content-center py-20">
      <p className="eyebrow mb-4">{STORE.name}</p>
      <h1 className="title title-lg mb-2">Admin sign in</h1>
      <hr className="gold-rule mb-8" />

      {!configured ? (
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Administration is not configured on this deployment. Set ADMIN_EMAIL and ADMIN_PASSWORD in Vercel.
        </p>
      ) : (
        <form action={attempt}>
          <label className="field-label" htmlFor="email">
            Admin email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            className="field-input"
            aria-describedby={error ? "login-error" : undefined}
          />
          <label className="field-label mt-5" htmlFor="password">
            Admin password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="field-input"
          />
          {error && (
            <p id="login-error" role="alert" className="mt-3 text-sm text-danger">
              That email or password is not correct.
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
