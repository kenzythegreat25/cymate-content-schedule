import type { ContentItem, Status } from "./types";

const KEY = "cymate-content-schedule:v2";
const LEGACY_KEY = "cymate-content-schedule:v1";

const STATUS_MIGRATIONS: Record<string, Status> = {
  Todo: "Idea",
  "In Progress": "Drafting",
};

function migrate(raw: unknown): ContentItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const item = r as Partial<ContentItem> & { status?: string };
    const status = (item.status && STATUS_MIGRATIONS[item.status]) || (item.status as Status) || "Idea";
    return {
      id: item.id ?? crypto.randomUUID(),
      title: item.title ?? "",
      date: item.date ?? "",
      onScreenText: item.onScreenText ?? "",
      description: item.description ?? "",
      platforms: Array.isArray(item.platforms) ? item.platforms : [],
      attachments: item.attachments ?? "",
      status,
      performanceScore: item.performanceScore ?? "",
      notes: item.notes ?? "",
      createdAt: item.createdAt ?? Date.now(),
    };
  });
}

export function loadItems(): ContentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrate(JSON.parse(legacy));
      window.localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

export function saveItems(items: ContentItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}
