import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface AppConfig {
  siteToken: string;
  siteId: string;
  /**
   * Optional override for the app's public base URL (webhook registration).
   * When unset, setup derives it from the incoming request, so one config
   * works across production and staging domains.
   */
  appUrl?: string;
  appPassword: string;
  sessionSecret: string;
  /** Optional Webflow API base override — local E2E mock only. */
  apiBase?: string;
  /** Optional public website bases for item links; independent of the Cloud app mount. */
  productionSiteUrl?: string;
  stagingSiteUrl?: string;
}

// Secrets/vars are configured on the Webflow Cloud environment (or .dev.vars
// locally). Fail loudly with the variable name so template users can self-serve.
export async function getConfig(): Promise<AppConfig> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, string | undefined>;
  const read = (key: string): string => {
    const value = e[key] ?? process.env[key];
    if (!value) {
      throw new Error(
        `Missing required environment variable ${key} — see .dev.vars.example`,
      );
    }
    return value;
  };
  return {
    siteToken: read("WEBFLOW_SITE_TOKEN"),
    siteId: read("WEBFLOW_SITE_ID"),
    appUrl: (e.APP_URL ?? process.env.APP_URL)?.replace(/\/$/, ""),
    appPassword: read("APP_PASSWORD"),
    sessionSecret: read("SESSION_SECRET"),
    apiBase: e.WEBFLOW_API_BASE ?? process.env.WEBFLOW_API_BASE,
    productionSiteUrl: e.PRODUCTION_SITE_URL ?? process.env.PRODUCTION_SITE_URL,
    stagingSiteUrl: e.STAGING_SITE_URL ?? process.env.STAGING_SITE_URL,
  };
}
