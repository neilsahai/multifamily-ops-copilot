/**
 * Server-side copilot request handling (used by /api/copilot). Reads
 * LLM_API_KEY and LLM_MODEL from the server environment only.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AS_OF_DATE, dataset } from "@/data";
import { CopilotError, runCopilot, type ToolCallRecord } from "./agent";
import { liveModeAvailability, readSharedCache, reserveLiveQuestion, writeSharedCache } from "./budget";
import type { CopilotResponse, GroundingReport } from "./contract";
import { FALLBACK_NOTE, runFallback } from "./fallback";
import { isPresetId, MAX_QUESTION_LENGTH, PRESETS, type PresetId } from "./presets";

export const DEFAULT_MODEL = "claude-opus-5";
const REQUEST_TIMEOUT_MS = 55_000;
/** Whole-question deadline, kept under the route's maxDuration (120s). */
export const TOTAL_DEADLINE_MS = 100_000;
const RATE_LIMIT = { windowMs: 10 * 60_000, max: 20 };
const CACHE_TTL_MS = 60 * 60_000;

export interface CopilotApiResult {
  mode: "live" | "fallback";
  /** Model that produced the answer (live mode only). */
  model: string | null;
  note: string;
  question: string;
  response: CopilotResponse;
  grounding: GroundingReport;
  toolCalls: ToolCallRecord[];
  cached: boolean;
}

// Per-instance first line of defence. The enforceable cap is the shared budget in budget.ts.
const hits = new Map<string, number[]>();
const cache = new Map<string, { at: number; result: CopilotApiResult }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > RATE_LIMIT.max;
}

/** Test hook: clear in-memory rate-limit and cache state. */
export function resetCopilotRouteState() {
  hits.clear();
  cache.clear();
}

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function handleCopilotRequest(req: Request): Promise<Response> {
  let body: { propertyId?: unknown; question?: unknown; presetId?: unknown };
  try {
    body = await req.json();
  } catch {
    return bad("Request body must be JSON.");
  }
  const property = dataset.properties.find((p) => p.id === body.propertyId);
  if (!property) return bad("Unknown propertyId.", 404);

  const presetId: PresetId | null = isPresetId(body.presetId) ? body.presetId : null;
  const question = presetId
    ? PRESETS.find((p) => p.id === presetId)!.question(property.neighborhood)
    : typeof body.question === "string"
      ? body.question.trim()
      : "";
  if (!question) return bad("Provide a presetId or a question.");
  if (question.length > MAX_QUESTION_LENGTH) return bad(`Questions are limited to ${MAX_QUESTION_LENGTH} characters.`);

  const fallback = (note: string): CopilotApiResult => {
    const run = runFallback({ presetId, propertyId: property.id, data: dataset, asOfDate: AS_OF_DATE });
    return { mode: "fallback", model: null, note, question, response: run.response, grounding: run.report, toolCalls: run.toolCalls, cached: false };
  };

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return Response.json(fallback(FALLBACK_NOTE));
  const availability = liveModeAvailability();
  if (!availability.available) {
    return Response.json(fallback(`Live copilot disabled: ${availability.reason}. ${FALLBACK_NOTE}`));
  }

  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  const cacheKey = `${model}|${property.id}|${question.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Response.json({ ...hit.result, cached: true });
  const shared = await readSharedCache<CopilotApiResult>(cacheKey);
  if (shared) {
    cache.set(cacheKey, { at: Date.now(), result: shared });
    return Response.json({ ...shared, cached: true });
  }

  const clientKey = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(clientKey)) {
    return Response.json(
      fallback(`Live copilot rate limit reached (${RATE_LIMIT.max} questions per 10 minutes). ${FALLBACK_NOTE}`),
      { status: 429 },
    );
  }
  const budget = await reserveLiveQuestion(clientKey);
  if (!budget.allowed) {
    return Response.json(fallback(`Live copilot paused: ${budget.reason}. ${FALLBACK_NOTE}`), { status: 429 });
  }

  try {
    const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
    const run = await runCopilot({
      client: client.beta.messages,
      model,
      question,
      propertyId: property.id,
      data: dataset,
      asOfDate: AS_OF_DATE,
      deadlineMs: TOTAL_DEADLINE_MS,
    });
    const result: CopilotApiResult = {
      mode: "live",
      model: run.model,
      note: `Live model answer (${run.model}), limited to read-only evidence tools and checked against their output.`,
      question,
      response: run.response,
      grounding: run.report,
      toolCalls: run.toolCalls,
      cached: false,
    };
    cache.set(cacheKey, { at: Date.now(), result });
    await writeSharedCache(cacheKey, result);
    return Response.json(result);
  } catch (err) {
    let reason: string;
    if (err instanceof CopilotError) reason = err.message;
    else if (err instanceof Anthropic.AuthenticationError) reason = "The configured LLM_API_KEY was rejected.";
    else if (err instanceof Anthropic.NotFoundError) reason = `Model "${model}" was not found; check LLM_MODEL.`;
    else if (err instanceof Anthropic.RateLimitError) reason = "The model provider rate-limited the request.";
    else if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError)
      reason = "The model request timed out.";
    else if (err instanceof Anthropic.APIError) reason = `The model provider returned an error (${err.status ?? "unknown"}).`;
    else reason = "The live copilot request failed.";
    console.error("copilot live request failed:", err);
    return Response.json(fallback(`Live copilot unavailable: ${reason} Showing the deterministic fallback instead; no model produced this answer.`));
  }
}

export interface CopilotStatus {
  mode: "live" | "fallback";
  model: string | null;
  note: string;
}

/** Whether live mode is configured. Never reveals the key itself. */
export function copilotStatus(): CopilotStatus {
  if (!process.env.LLM_API_KEY) return { mode: "fallback", model: null, note: FALLBACK_NOTE };
  const availability = liveModeAvailability();
  if (!availability.available) {
    return { mode: "fallback", model: null, note: `Live copilot disabled: ${availability.reason}. ${FALLBACK_NOTE}` };
  }
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;
  return { mode: "live", model, note: `Live copilot mode (${model}) with read-only evidence tools.` };
}
