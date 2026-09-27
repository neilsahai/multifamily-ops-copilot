/**
 * Shared live-model budget and answer cache for the public demo.
 *
 * Uses a Redis REST endpoint (Upstash for Redis, e.g. via the Vercel
 * Marketplace). Counters are atomic INCRs shared by every server instance, so
 * the daily cap bounds total live questions no matter how many instances run.
 *
 * Hosted deployments (VERCEL=1) fail closed: without a reachable store, live
 * mode is disabled and the labeled fallback answers instead. Local development
 * without a store is allowed, with only the per-instance limiter.
 */
import { createHash } from "node:crypto";

export const DEFAULT_DAILY_LIMIT = 60;
export const DEFAULT_PER_CLIENT_HOURLY_LIMIT = 8;
export const SHARED_CACHE_TTL_SECONDS = 24 * 60 * 60;

type Env = Record<string, string | undefined>;

interface Store {
  url: string;
  token: string;
}

export function sharedStore(env: Env = process.env): Store | null {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const isHosted = (env: Env = process.env) => env.VERCEL === "1";

function positiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function limits(env: Env = process.env) {
  return {
    daily: positiveInt(env.COPILOT_DAILY_LIVE_LIMIT, DEFAULT_DAILY_LIMIT),
    perClientHourly: positiveInt(env.COPILOT_CLIENT_HOURLY_LIMIT, DEFAULT_PER_CLIENT_HOURLY_LIMIT),
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

async function pipeline(store: Store, commands: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${store.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${store.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Budget store returned ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: string }[];
  const failed = body.find((r) => r.error);
  if (failed) throw new Error(`Budget store error: ${failed.error}`);
  return body.map((r) => r.result);
}

export type BudgetDecision =
  | { allowed: true; shared: boolean; used?: number; limit?: number }
  | { allowed: false; reason: string };

/** Whether live mode can run at all in this environment (no counters consumed). */
export function liveModeAvailability(env: Env = process.env): { available: boolean; reason?: string } {
  if (!env.LLM_API_KEY) return { available: false, reason: "LLM_API_KEY is not set" };
  if (isHosted(env) && !sharedStore(env)) {
    return { available: false, reason: "no shared request budget is configured for this deployment" };
  }
  return { available: true };
}

/**
 * Reserve one live question against the shared daily cap and the per-client
 * hourly cap. Errors fail closed on hosted deployments.
 */
export async function reserveLiveQuestion(clientKey: string, now = new Date(), env: Env = process.env): Promise<BudgetDecision> {
  const store = sharedStore(env);
  if (!store) {
    return isHosted(env)
      ? { allowed: false, reason: "no shared request budget is configured for this deployment" }
      : { allowed: true, shared: false };
  }
  const { daily, perClientHourly } = limits(env);
  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  const dayKey = `copilot:live:day:${day}`;
  const clientKeyName = `copilot:live:client:${sha(clientKey)}:${hour}`;
  try {
    const [dayCount, , clientCount] = (await pipeline(store, [
      ["INCR", dayKey],
      ["EXPIRE", dayKey, 2 * 24 * 60 * 60],
      ["INCR", clientKeyName],
      ["EXPIRE", clientKeyName, 2 * 60 * 60],
    ])) as number[];
    if (clientCount > perClientHourly) {
      return { allowed: false, reason: `this visitor reached the limit of ${perClientHourly} live questions per hour` };
    }
    if (dayCount > daily) {
      return { allowed: false, reason: `the demo's shared limit of ${daily} live questions per day has been reached` };
    }
    return { allowed: true, shared: true, used: dayCount, limit: daily };
  } catch (err) {
    console.error("copilot budget store unavailable:", (err as Error).message);
    return isHosted(env)
      ? { allowed: false, reason: "the shared request budget could not be checked" }
      : { allowed: true, shared: false };
  }
}

/** Shared answer cache so repeated questions (e.g. presets) do not spend again. */
export async function readSharedCache<T>(key: string, env: Env = process.env): Promise<T | null> {
  const store = sharedStore(env);
  if (!store) return null;
  try {
    const [value] = await pipeline(store, [["GET", `copilot:answer:${sha(key)}`]]);
    return typeof value === "string" ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function writeSharedCache(key: string, value: unknown, env: Env = process.env): Promise<void> {
  const store = sharedStore(env);
  if (!store) return;
  try {
    await pipeline(store, [["SET", `copilot:answer:${sha(key)}`, JSON.stringify(value), "EX", SHARED_CACHE_TTL_SECONDS]]);
  } catch {
    // Cache is best-effort.
  }
}
