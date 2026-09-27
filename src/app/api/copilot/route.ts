import { copilotStatus, handleCopilotRequest } from "@/lib/copilot/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Covers the copilot's 100s whole-question deadline (Vercel Hobby allows up to 300s).
export const maxDuration = 120;

export async function GET() {
  return Response.json(copilotStatus());
}

export async function POST(req: Request) {
  return handleCopilotRequest(req);
}
