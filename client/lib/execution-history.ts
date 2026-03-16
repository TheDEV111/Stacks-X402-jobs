export interface ExecutionHistoryItem {
  id: string;
  skillId: string;
  endpoint: string;
  txHash: string | null;
  priceMicroSTX: number;
  status: "success" | "error";
  requestPreview: string | null;
  resultPreview: string | null;
  createdAt: number;
}

export interface ExecutionHistoryInput {
  id: string;
  skillId: string;
  endpoint: string;
  txHash: string | null;
  priceMicroSTX: number;
  status: "success" | "error";
  requestBody?: Record<string, unknown> | null;
  result?: unknown;
  createdAt: number;
}

const STORAGE_KEY = "x402-execution-history";
const HISTORY_LIMIT = 100;
const HISTORY_TTL_SEC = 7 * 24 * 60 * 60;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getExecutionHistory(): ExecutionHistoryItem[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as ExecutionHistoryItem[];
    if (!Array.isArray(parsed)) return [];

    // Prune expired items and malformed entries eagerly.
    const now = Math.floor(Date.now() / 1000);
    const pruned = parsed.filter(
      (item) =>
        item &&
        typeof item.createdAt === "number" &&
        now - item.createdAt <= HISTORY_TTL_SEC
    );

    if (pruned.length !== parsed.length) {
      saveExecutionHistory(pruned);
    }

    return pruned;
  } catch {
    return [];
  }
}

export function saveExecutionHistory(items: ExecutionHistoryItem[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addExecutionHistory(input: ExecutionHistoryInput): void {
  const item: ExecutionHistoryItem = {
    id: input.id,
    skillId: input.skillId,
    endpoint: input.endpoint,
    txHash: input.txHash,
    priceMicroSTX: input.priceMicroSTX,
    status: input.status,
    requestPreview: safePreview(input.requestBody),
    resultPreview: safePreview(input.result),
    createdAt: input.createdAt,
  };

  const current = getExecutionHistory();
  const next = [item, ...current].slice(0, HISTORY_LIMIT);
  saveExecutionHistory(next);
}

export function clearExecutionHistory(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function safePreview(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  // Redact obvious secret-like keys from objects.
  const redacted = redactSecrets(value);

  try {
    const text = JSON.stringify(redacted);
    if (!text) return null;
    return text.length > 240 ? `${text.slice(0, 240)}...` : text;
  } catch {
    return null;
  }
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [key, v] of Object.entries(source)) {
      const lowered = key.toLowerCase();
      if (
        lowered.includes("key") ||
        lowered.includes("token") ||
        lowered.includes("secret") ||
        lowered.includes("password")
      ) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactSecrets(v);
      }
    }

    return out;
  }

  return value;
}
