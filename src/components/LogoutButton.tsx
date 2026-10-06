"use client";

import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/basePath";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch(apiPath("/api/logout"), { method: "POST" });
        router.push("/login");
      }}
      className={className ?? "text-[13px] text-faint hover:text-ink"}
    >
      Sign out
    </button>
  );
}
