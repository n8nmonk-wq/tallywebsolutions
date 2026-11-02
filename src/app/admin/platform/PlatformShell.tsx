"use client";
import { usePathname, useSearchParams } from "next/navigation";
import AdminShell, { type AdminSection } from "@/components/AdminShell";

export default function PlatformShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(), params = useSearchParams();
  const section = path.split("/")[3] || "modules";
  const active: AdminSection = section === "modules" && params.get("type") === "banner" ? "banners"
    : (["authors", "collections", "modules", "reviews", "delivery"] as const).find((s) => s === section) ?? "modules";
  const titles: Record<string, string> = { authors: "Developers", collections: "Collections", banners: "Banners", modules: "Homepage sections", reviews: "Submissions", delivery: "Delivery recovery" };
  return <AdminShell active={active} title={titles[active]}>{children}</AdminShell>;
}
