/**
 * Live copilot: a bounded tool-use loop over the read-only evidence tools,
 * ending in a schema-constrained JSON answer that is then grounded.
 *
 * The client is injected so tests can drive the loop with a scripted model.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Dataset } from "@/data/types";
import { getFlaggedResidents } from "@/lib/analytics";
import {
  buildUserMessage,
  groundResponse,
  isCopilotResponse,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  type CopilotResponse,
  type GroundingContext,
  type GroundingReport,
} from "./contract";
import { availableActions, executeTool, extractRecordIds, TOOL_DEFINITIONS, type SuggestedAction } from "./tools";

export const MAX_TOOL_ROUNDS = 6;
export const MAX_OUTPUT_TOKENS = 16000;

/** The one SDK method the loop uses; satisfied by `new Anthropic().beta.messages`. */
export interface MessagesClient {
  create(
    params: Anthropic.Beta.MessageCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<Anthropic.Beta.BetaMessage>;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
}

export interface CopilotRun {
  response: CopilotResponse;
  report: GroundingReport;
  toolCalls: ToolCallRecord[];
  model: string;
}

export class CopilotError extends Error {}

/** Server-side refusal fallbacks are offered on these model families. */
const supportsServerFallbacks = (model: string) => /^claude-(opus-5|fable-5)/.test(model);

export function newGroundingContext(data: Dataset, asOfDate: string, propertyId: string): GroundingContext {
  const actionsByResident = new Map<string, SuggestedAction[]>();
  for (const f of getFlaggedResidents(propertyId, data, asOfDate)) {
    actionsByResident.set(f.resident.id, availableActions(f.resident.id, data, asOfDate));
  }
  return { returnedIds: new Set(), toolText: "", toolCallCount: 0, actionsByResident };
}

/** Run a tool and record its output in the grounding context. */
export function runTool(name: string, input: unknown, data: Dataset, asOfDate: string, ctx: GroundingContext) {
  const result = executeTool(name, input, data, asOfDate);
  ctx.toolCallCount++;
  ctx.toolText += "\n" + result.content;
  if (result.ok) for (const id of extractRecordIds(result.content)) ctx.returnedIds.add(id);
  return result;
}

export async function runCopilot(opts: {
  client: MessagesClient;
  model: string;
  question: string;
  propertyId: string;
  data: Dataset;
  asOfDate: string;
  /** Whole-question deadline; in-flight model requests are aborted when it passes. */
  deadlineMs?: number;
}): Promise<CopilotRun> {
  const { client, model, question, propertyId, data, asOfDate, deadlineMs } = opts;
  const signal = deadlineMs ? AbortSignal.timeout(deadlineMs) : undefined;
  const ctx = newGroundingContext(data, asOfDate, propertyId);
  const toolCalls: ToolCallRecord[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: buildUserMessage(question, propertyId, asOfDate) },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) throw new CopilotError("The copilot ran out of time before answering.");
    const response = await client.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOL_DEFINITIONS,
      output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> } },
      messages,
      ...(supportsServerFallbacks(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
    }, signal ? { signal } : undefined);

    if (response.stop_reason === "refusal") throw new CopilotError("The model declined this request.");
    if (response.stop_reason === "max_tokens") throw new CopilotError("The model response was cut off at the output limit.");

    // Keep the full content (including any thinking blocks) for the next turn.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    if (response.stop_reason === "tool_use") {
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const result = runTool(block.name, block.input, data, asOfDate, ctx);
        toolCalls.push({ name: block.name, input: block.input, ok: result.ok });
        results.push({ type: "tool_result", tool_use_id: block.id, content: result.content, is_error: !result.ok });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    // end_turn: the final text block is the structured answer.
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new CopilotError("The model did not return valid JSON.");
    }
    if (!isCopilotResponse(parsed)) throw new CopilotError("The model response did not match the response contract.");
    const { response: grounded, report } = groundResponse(parsed, ctx);
    return { response: grounded, report, toolCalls, model: response.model ?? model };
  }
  throw new CopilotError(`The model exceeded ${MAX_TOOL_ROUNDS} tool rounds without answering.`);
}
