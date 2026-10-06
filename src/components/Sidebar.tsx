"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

export interface ShellCollection {
  id: string;
  displayName: string;
  itemCount: number;
}

interface SidebarProps {
  collections: ShellCollection[];
  watching: boolean;
  syncedLabel: string | null;
}

function Brand() {
  return (
    <Link href="/" className="block">
      <span className="block whitespace-nowrap font-display text-[17px] font-bold text-white">
        CMS Version History
      </span>
      <span className="mt-[3px] block whitespace-nowrap font-mono text-[11px] text-faint">
        example template
      </span>
    </Link>
  );
}

function navClass(active: boolean) {
  return `flex items-center justify-between rounded-[7px] px-2.5 py-2 text-sm transition-colors ${
    active
      ? "bg-dark-active font-medium text-white"
      : "text-dark-text hover:bg-dark-active/60 hover:text-white"
  }`;
}

export function Sidebar({ collections, watching, syncedLabel }: SidebarProps) {
  const pathname = usePathname();
  const isOverview = pathname === "/";
  const isActivity = pathname.startsWith("/activity");
  const activeCollection = collections.find((c) =>
    pathname.startsWith(`/collections/${c.id}`),
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[232px] shrink-0 flex-col bg-dark py-5 text-dark-text shell:flex">
        <div className="border-b border-dark-line px-5 pb-[18px]">
          <Brand />
        </div>

        <nav className="flex flex-col gap-0.5 px-3 py-[18px]">
          <Link href="/" className={navClass(isOverview)}>
            Overview
          </Link>
          <Link href="/activity" className={navClass(isActivity)}>
            Activity
          </Link>
          <Link href="/settings" className={navClass(pathname.startsWith("/settings"))}>History & health</Link>
        </nav>

        {collections.length > 0 && (
          <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-3 py-1.5">
            <div className="px-2 py-2 font-mono text-[11px] tracking-[0.06em] text-faint">
              COLLECTIONS
            </div>
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/collections/${c.id}`}
                className={navClass(activeCollection?.id === c.id)}
              >
                <span className="truncate">{c.displayName}</span>
                <span className="ml-2 font-mono text-[11px] text-faint">
                  {c.itemCount}
                </span>
              </Link>
            ))}
          </nav>
        )}

        <div className="mt-auto border-t border-dark-line px-5 pt-4">
          {watching ? (
            <div className="flex items-center gap-2 font-mono text-xs text-ok">
              <span className="size-[7px] rounded-full bg-ok" aria-hidden />
              hooks configured
            </div>
          ) : (
            <div className="flex items-center gap-2 font-mono text-xs text-faint">
              <span className="size-[7px] rounded-full border border-faint" aria-hidden />
              not watching yet
            </div>
          )}
          {syncedLabel && (
            <div className="mt-[5px] font-mono text-[11px] text-faint">
              synced {syncedLabel}
            </div>
          )}
          <LogoutButton className="mt-3.5 block text-[13px] text-faint transition-colors hover:text-white" />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex flex-wrap items-center gap-3 bg-dark px-5 py-3 text-dark-text shell:hidden">
        <Brand />
        <nav className="order-last flex w-full flex-wrap items-center gap-1 text-sm">
          <Link href="/" className={navClass(isOverview)}>
            Overview
          </Link>
          <Link href="/activity" className={navClass(isActivity)}>
            Activity
          </Link>
          <Link href="/settings" className={navClass(pathname.startsWith("/settings"))}>Settings</Link>
          {collections.length > 0 && (
            <details className="relative">
              <summary className={`${navClass(Boolean(activeCollection))} cursor-pointer list-none`}>
                {activeCollection?.displayName ?? "Collections"}
                <span className="ml-1.5 font-mono text-[10px] text-faint">▾</span>
              </summary>
              <div className="absolute left-0 top-full z-30 mt-2 flex w-56 flex-col gap-0.5 rounded-[10px] border border-dark-line bg-dark p-1.5 shadow-overlay">
                {collections.map((c) => (
                  <Link
                    key={c.id}
                    href={`/collections/${c.id}`}
                    className={navClass(activeCollection?.id === c.id)}
                  >
                    <span className="truncate">{c.displayName}</span>
                    <span className="ml-2 font-mono text-[11px] text-faint">
                      {c.itemCount}
                    </span>
                  </Link>
                ))}
              </div>
            </details>
          )}
        </nav>
        <LogoutButton className="ml-auto text-[13px] text-faint transition-colors hover:text-white" />
      </header>
    </>
  );
}
