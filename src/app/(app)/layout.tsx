import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getShellData } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import {
  SESSION_COOKIE,
  verifySessionToken,
  getSessionSecret,
} from "@/lib/session";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Middleware gates most paths, but a request for exactly the mount path
  // (e.g. "/app") can bypass its matcher — verify the session here as well.
  const secret = await getSessionSecret();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!secret || !(await verifySessionToken(secret, token))) {
    redirect("/login");
  }

  const { collections, watching, lastSyncedAt } = await getShellData();

  return (
    <div className="flex min-h-screen flex-col shell:h-screen shell:flex-row">
      <Sidebar
        collections={collections.map((c) => ({
          id: c.id,
          displayName: c.displayName,
          itemCount: c.itemCount,
        }))}
        watching={watching}
        syncedLabel={lastSyncedAt ? formatDate(lastSyncedAt) : null}
      />
      <main className="min-w-0 flex-1 shell:overflow-y-auto">{children}</main>
    </div>
  );
}
