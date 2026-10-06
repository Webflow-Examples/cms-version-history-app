"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiPath } from "@/lib/basePath";
import { Spinner } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(apiPath("/api/login"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      setBusy(false);
      setError(
        "Can't reach the server — it may be redeploying. Try again in a minute.",
      );
      return;
    }
    setBusy(false);
    if (res.ok) {
      const next = searchParams.get("next");
      router.push(next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/");
      router.refresh();
    } else if (res.status === 401) {
      setError("That password didn't match. Try again.");
    } else {
      // Anything else means the request never reached this app's login
      // endpoint (misrouted base path, proxy error) — don't blame the password.
      setError(`Sign-in failed (HTTP ${res.status})`);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-[360px] rounded-xl bg-surface px-7 pb-6 pt-7"
    >
      <h1 className="font-display text-xl font-bold">Sign in</h1>
      <p className="mt-1 text-[13px] text-ink-soft">
        One password protects this site&rsquo;s history.
      </p>
      <label
        htmlFor="password"
        className="mt-5 block text-[13px] font-semibold"
      >
        Password
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        className={`mt-1.5 w-full rounded-[7px] border px-3 py-2.5 text-sm outline-none ${
          error
            ? "border-warn-field bg-warn-field-bg"
            : "border-line bg-surface focus:border-accent focus:ring-2 focus:ring-accent/25"
        }`}
      />
      <button
        type="submit"
        disabled={busy || !password}
        aria-busy={busy}
        className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[7px] bg-accent py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-75"
      >
        {busy ? (
          <>
            <Spinner onDark />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
      {error && <p className="mt-3 text-[13px] text-warn">{error}</p>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-dark p-6">
      <div className="absolute left-6 top-6 flex items-baseline gap-2.5 sm:left-9 sm:top-7">
        <span className="font-display text-[17px] font-bold text-white">
          CMS Version History
        </span>
        <span className="font-mono text-[11px] text-faint">example template</span>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="absolute bottom-6 left-6 font-mono text-[13px] text-faint sm:bottom-7 sm:left-9">
        Every edit{" "}
        <span className="text-removed line-through">is forever</span>{" "}
        <span className="text-ok">has a history</span>
      </p>
    </main>
  );
}
