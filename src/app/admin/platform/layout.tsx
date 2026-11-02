import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-auth";
import PlatformShell from "./PlatformShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform CMS", robots: { index: false, follow: false } };
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin/login");
  return <Suspense><PlatformShell>{children}</PlatformShell></Suspense>;
}
