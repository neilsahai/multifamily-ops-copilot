import { afterEach, describe, expect, it, vi } from "vitest";
import { liveModeAvailability, reserveLiveQuestion } from "./budget";

const store = { KV_REST_API_URL: "https://store.example", KV_REST_API_TOKEN: "t" };
const hosted = { VERCEL: "1", LLM_API_KEY: "k" };
const local = { LLM_API_KEY: "k" };

function mockStore(dayCount: number, clientCount: number) {
  const fetchMock = vi.fn(async () =>
    Response.json([{ result: dayCount }, { result: 1 }, { result: clientCount }, { result: 1 }]),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("shared live-model budget", () => {
  it("fails closed on a hosted deployment without a shared store", async () => {
    expect(liveModeAvailability(hosted)).toEqual({ available: false, reason: "no shared request budget is configured for this deployment" });
    const d = await reserveLiveQuestion("1.2.3.4", new Date(), hosted);
    expect(d.allowed).toBe(false);
  });

  it("allows local development without a store (per-instance limiter only)", async () => {
    expect(liveModeAvailability(local).available).toBe(true);
    expect(await reserveLiveQuestion("local", new Date(), local)).toEqual({ allowed: true, shared: false });
  });

  it("counts atomically in the shared store and allows under the caps", async () => {
    const fetchMock = mockStore(5, 1);
    const d = await reserveLiveQuestion("1.2.3.4", new Date("2026-09-27T12:00:00Z"), { ...hosted, ...store });
    expect(d).toEqual({ allowed: true, shared: true, used: 5, limit: 60 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://store.example/pipeline");
    const commands = JSON.parse(String(init.body));
    expect(commands[0]).toEqual(["INCR", "copilot:live:day:2026-09-27"]);
    expect(commands[2][1]).not.toContain("1.2.3.4"); // client IPs are hashed
  });

  it("denies when the shared daily cap is exceeded", async () => {
    mockStore(61, 1);
    const d = await reserveLiveQuestion("1.2.3.4", new Date(), { ...hosted, ...store });
    expect(d).toEqual({ allowed: false, reason: "the demo's shared limit of 60 live questions per day has been reached" });
  });

  it("denies when one visitor exceeds the hourly cap, and honours configured limits", async () => {
    mockStore(3, 3);
    const d = await reserveLiveQuestion("1.2.3.4", new Date(), { ...hosted, ...store, COPILOT_CLIENT_HOURLY_LIMIT: "2" });
    expect(d.allowed).toBe(false);
  });

  it("fails closed on a hosted deployment when the store errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    expect((await reserveLiveQuestion("1.2.3.4", new Date(), { ...hosted, ...store })).allowed).toBe(false);
    expect((await reserveLiveQuestion("1.2.3.4", new Date(), { ...local, ...store })).allowed).toBe(true);
  });
});
