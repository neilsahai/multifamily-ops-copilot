import { AS_OF_DATE, dataset } from "@/data";
import { buildEvidencePacket } from "@/lib/analytics";

/** Read-only JSON evidence packet: the same structure the investigation page renders. */
export async function GET(_req: Request, { params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  if (!dataset.properties.some((p) => p.id === propertyId)) {
    return Response.json({ error: `Unknown property: ${propertyId}` }, { status: 404 });
  }
  return Response.json(buildEvidencePacket(propertyId, dataset, AS_OF_DATE));
}
