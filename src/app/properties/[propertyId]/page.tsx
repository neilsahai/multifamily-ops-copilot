import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AS_OF_DATE, dataset } from "@/data";
import { CopilotPanel } from "@/components/CopilotPanel";
import { DemoTaskList } from "@/components/DemoTaskList";
import { EvidenceClaimCard } from "@/components/EvidenceClaimCard";
import { FlaggedResidentsTable } from "@/components/FlaggedResidentsTable";
import { HowCalculated } from "@/components/HowCalculated";
import { MeasurementPlan } from "@/components/MeasurementPlan";
import { Badge, Card, Eyebrow } from "@/components/ui";
import { buildEvidencePacket, getFlaggedResidents, getPropertyMetrics, getReviewStatus } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { fmtDays, fmtPct } from "@/lib/format";

type Props = { params: Promise<{ propertyId: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return dataset.properties.map((p) => ({ propertyId: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { propertyId } = await params;
  const p = dataset.properties.find((x) => x.id === propertyId);
  return { title: p ? `${p.neighborhood} investigation · Multifamily Ops Intelligence` : "Not found" };
}

export default async function InvestigationPage({ params }: Props) {
  const { propertyId } = await params;
  if (!dataset.properties.some((p) => p.id === propertyId)) notFound();

  const metrics = getPropertyMetrics(propertyId, dataset, AS_OF_DATE);
  const review = getReviewStatus(propertyId, dataset, AS_OF_DATE);
  const packet = buildEvidencePacket(propertyId, dataset, AS_OF_DATE);
  const flagged = getFlaggedResidents(propertyId, dataset, AS_OF_DATE);
  const { property } = metrics;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/" className="hover:text-ink hover:underline">Portfolio Operations</Link>
        <span aria-hidden className="mx-2">/</span>
        <span aria-current="page">{property.neighborhood}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Investigation · as of {formatDate(AS_OF_DATE)}</Eyebrow>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {property.neighborhood} <span className="font-normal text-ink-muted">· {property.name}</span>
          </h1>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-xs text-ink-faint">Occupancy</dt><dd className="font-medium">{fmtPct(metrics.occupancy.value)} <span className="text-xs text-ink-faint">({metrics.occupancy.numerator}/{metrics.occupancy.denominator})</span></dd></div>
          <div><dt className="text-xs text-ink-faint">Open work orders</dt><dd className="font-medium">{metrics.openWorkOrders.count}</dd></div>
          <div><dt className="text-xs text-ink-faint">Median open WO age</dt><dd className="font-medium">{fmtDays(metrics.medianOpenWorkOrderAgeDays)}</dd></div>
          <div><dt className="text-xs text-ink-faint">Expiring ≤60d</dt><dd className="font-medium">{metrics.upcomingExpirations.count}</dd></div>
        </dl>
      </header>

      <Card className={packet.patternDetected ? "border-l-4 border-l-warn p-5 sm:p-6" : "p-5 sm:p-6"}>
        <div className="flex flex-wrap items-center gap-2">
          {review.needsReview ? <Badge tone="warn">⚑ Needs review</Badge> : <Badge>No review flag</Badge>}
          <Badge wrap>Finding · deterministic template over evidence packet</Badge>
        </div>
        <h2 className="mt-3 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{packet.headline}</h2>
        <div className="mt-3 max-w-3xl space-y-2 text-[15px] leading-relaxed text-ink-muted">
          {packet.narrative.map((s) => <p key={s}>{s}</p>)}
        </div>
        <p className="mt-4 text-xs text-ink-faint">{packet.caveats.join(" ")}</p>
      </Card>

      <section aria-labelledby="evidence-h">
        <h2 id="evidence-h" className="sr-only">Evidence</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {packet.claims.map((c) => <EvidenceClaimCard key={c.id} claim={c} />)}
        </div>
      </section>

      <HowCalculated />

      <CopilotPanel
        propertyId={propertyId}
        neighborhood={property.neighborhood}
        residentNames={Object.fromEntries(
          dataset.residents.filter((r) => r.propertyId === propertyId).map((r) => [r.id, `${r.name}, Unit ${r.unit}`]),
        )}
      />

      <Card aria-labelledby="flagged-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 id="flagged-h" className="font-semibold">Flagged residents <span className="font-normal text-ink-muted">({flagged.length})</span></h2>
          <p className="text-xs text-ink-faint">Pending renewals ending within 90 days that meet rule A or B · select a resident to review</p>
        </div>
        <FlaggedResidentsTable rows={flagged} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <MeasurementPlan
          asOfDate={AS_OF_DATE}
          propertyLabel={property.neighborhood}
          baseline={{ renewed: metrics.renewal.renewed, denominator: metrics.renewal.denominator, value: metrics.renewal.value }}
          flaggedIds={flagged.map((f) => f.resident.id)}
          flaggedWithOpenWorkOrders={flagged.filter((f) => f.openWorkOrders.length > 0).length}
        />
        <Card>
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <h2 className="font-semibold">Demo tasks &amp; drafts · {property.neighborhood}</h2>
            <p className="text-xs text-ink-faint">Simulated. Stored in this browser only.</p>
          </div>
          <DemoTaskList propertyId={propertyId} />
        </Card>
      </div>
    </div>
  );
}
