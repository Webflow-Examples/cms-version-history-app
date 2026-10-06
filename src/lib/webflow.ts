// Minimal Webflow Data API v2 client for the Workers runtime.
// Deliberately not the official SDK: we need tight control over rate-limit
// behavior and a small bundle (10MB worker limit).

const DEFAULT_API_BASE = "https://api.webflow.com/v2";

// Workers allow max 6 simultaneous outgoing requests; leave headroom for R2/KV.
const MAX_CONCURRENT = 4;
const MAX_RETRIES = 0; // Durable jobs/webhook delivery own retries; never sleep through the request deadline.

export interface WebflowField {
  id: string;
  slug: string;
  displayName: string;
  type: string;
  isRequired?: boolean;
  isEditable?: boolean;
}

export interface WebflowCollection {
  id: string;
  displayName: string;
  slug: string;
  fields?: WebflowField[];
}

export interface WebflowSite {
  shortName?: string;
  customDomains?: { id: string; url?: string; lastPublished?: string | null }[];
  locales?: {
    primary?: { cmsLocaleId: string; subdirectory?: string; redirect?: boolean };
    secondary?: { cmsLocaleId: string }[];
  };
}

export interface WebflowItem {
  id: string;
  cmsLocaleId?: string;
  lastPublished: string | null;
  lastUpdated: string | null;
  createdOn: string | null;
  isArchived: boolean;
  isDraft: boolean;
  fieldData: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  pagination: { limit: number; offset: number; total: number };
}

export interface WebflowWebhook {
  id: string;
  triggerType: string;
  url: string;
  secretKey?: string; // returned once on creation for site-token webhooks
}

export class WebflowError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "WebflowError";
  }
}

export class WebflowClient {
  private deadline = Date.now() + 12_000;
  private active = 0;
  private queue: Array<() => void> = [];

  // apiBase is overridable so local E2E can point at a mock API
  // (WEBFLOW_API_BASE, resolved via getConfig); unset in production.
  constructor(
    private token: string,
    private apiBase: string = DEFAULT_API_BASE,
  ) {}

  private async acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }

  async request<T>(
    path: string,
    init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
  ): Promise<T> {
    const url = new URL(`${this.apiBase}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    await this.acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(url.toString(), {
          method: init.method ?? "GET",
          headers: {
            authorization: `Bearer ${this.token}`,
            accept: "application/json",
            ...(init.body !== undefined
              ? { "content-type": "application/json" }
              : {}),
          },
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
          signal: AbortSignal.timeout(Math.max(1, Math.min(5_000, this.deadline - Date.now()))),
        });

        if (res.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get("Retry-After") ?? "10");
          // Cap the wait so a single request can't blow the 20s request budget;
          // callers doing bulk work (backfill) chunk across requests instead.
          await sleep(Math.min(retryAfter, 15) * 1000);
          continue;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => undefined);
          throw new WebflowError(
            `Webflow API ${init.method ?? "GET"} ${path} → ${res.status}`,
            res.status,
            body,
          );
        }
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }
    } finally {
      this.release();
    }
  }

  // --- Collections ---
  getSite(siteId: string) {
    return this.request<WebflowSite>(`/sites/${siteId}`);
  }
  listCollections(siteId: string) {
    return this.request<{ collections: WebflowCollection[] }>(
      `/sites/${siteId}/collections`,
    );
  }

  getCollection(collectionId: string) {
    return this.request<WebflowCollection>(`/collections/${collectionId}`);
  }

  // --- Items (staged) ---
  listItems(collectionId: string, opts: { offset?: number; limit?: number } = {}) {
    return this.request<Paginated<WebflowItem>>(
      `/collections/${collectionId}/items`,
      { query: { offset: opts.offset ?? 0, limit: opts.limit ?? 100 } },
    );
  }

  getItem(collectionId: string, itemId: string) {
    return this.request<WebflowItem>(
      `/collections/${collectionId}/items/${itemId}`,
    );
  }

  createItem(
    collectionId: string,
    body: { isDraft?: boolean; isArchived?: boolean; fieldData: Record<string, unknown> },
  ) {
    return this.request<WebflowItem>(`/collections/${collectionId}/items`, {
      method: "POST",
      body,
    });
  }

  updateItem(
    collectionId: string,
    itemId: string,
    body: { isDraft?: boolean; isArchived?: boolean; fieldData: Record<string, unknown> },
  ) {
    return this.request<WebflowItem>(
      `/collections/${collectionId}/items/${itemId}`,
      { method: "PATCH", body },
    );
  }

  // --- Publish controls ---
  publishItems(collectionId: string, itemIds: string[]) {
    return this.request<{ publishedItemIds?: string[]; errors?: unknown[] }>(
      `/collections/${collectionId}/items/publish`,
      { method: "POST", body: { itemIds } },
    );
  }

  unpublishLiveItem(collectionId: string, itemId: string) {
    return this.request<void>(
      `/collections/${collectionId}/items/${itemId}/live`,
      { method: "DELETE" },
    );
  }

  publishSite(
    siteId: string,
    body: {
      publishToWebflowSubdomain?: boolean;
      customDomains?: string[];
      pageId?: string;
    },
  ) {
    return this.request<unknown>(`/sites/${siteId}/publish`, {
      method: "POST",
      body,
    });
  }

  // --- Webhooks ---
  listWebhooks(siteId: string) {
    return this.request<{ webhooks: WebflowWebhook[] }>(
      `/sites/${siteId}/webhooks`,
    );
  }

  createWebhook(siteId: string, triggerType: string, url: string) {
    return this.request<WebflowWebhook>(`/sites/${siteId}/webhooks`, {
      method: "POST",
      body: { triggerType, url },
    });
  }

  deleteWebhook(webhookId: string) {
    return this.request<void>(`/webhooks/${webhookId}`, { method: "DELETE" });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const CMS_ITEM_TRIGGERS = [
  "collection_item_created",
  "collection_item_changed",
  "collection_item_deleted",
  "collection_item_published",
  "collection_item_unpublished",
] as const;

export type CmsItemTrigger = (typeof CMS_ITEM_TRIGGERS)[number];
