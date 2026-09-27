import { AS_OF_DATE, dataset } from "@/data";
import { MetricLabel } from "@/components/MetricLabel";
import { Badge, ButtonLink, Card, cx, Eyebrow } from "@/components/ui";
import { getPortfolioMetrics } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { fmtDays, fmtPct, plural } from "@/lib/format";

export default function PortfolioPage() {
  const portfolio = getPortfolioMetrics(dataset, AS_OF_DATE);
  const { totals } = portfolio;
  const rows = [...portfolio.properties].sort((a, b) => Number(b.review.needsReview) - Number(a.review.needsReview));
  const asOf = formatDate(AS_OF_DATE);

  const tiles = [
    { id: "occupancy" as const, value: fmtPct(totals.occupancy.value), detail: `${totals.occupancy.numerator.toLocaleString()} of ${totals.occupancy.denominator.toLocaleString()} units · as of ${asOf}` },
    { id: "renewalRate" as const, value: fmtPct(totals.renewal.value), detail: `${totals.renewal.renewed} renewed of ${totals.renewal.denominator} decisions · trailing 90 days` },
    { id: "openWorkOrders" as const, value: String(totals.openWorkOrders), detail: `Count across ${plural(portfolio.properties.length, "property", "properties")} · as of ${asOf}` },
    { id: "upcomingExpirations" as const, value: String(totals.upcomingExpirations), detail: "Pending leases ending in the next 60 days" },
  ];

  return (
    <div className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <Eyebrow>Regional operations · 8 properties · Chicago area</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Portfolio Operations</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
            Renewal performance is slipping at one property. Lease, work-order, resident-feedback and outreach records
            live in separate systems, so it is hard to tell a service problem from a pricing problem or to know which
            residents need attention first. This view joins those records and shows the evidence behind every flag.
          </p>
        </div>
        <Card className="p-4 text-sm leading-relaxed text-ink-muted">
          <p className="font-medium text-ink">Demo path (about 60 seconds)</p>
          <p className="mt-1">
            Investigate the property flagged for review → read the evidence → open Sarah Chen, Unit 1704 → draft and
            approve a maintenance escalation. The task is simulated and saved only in this browser.
          </p>
        </Card>
      </section>

      <section aria-label="Portfolio summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.id} className="p-4">
            <p className="text-sm font-medium text-ink-muted">
              <MetricLabel id={t.id} />
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{t.value}</p>
            <p className="mt-1 text-xs text-ink-faint">{t.detail}</p>
          </Card>
        ))}
      </section>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-semibold">Properties</h2>
          <p className="text-xs text-ink-faint">
            {plural(totals.propertiesNeedingReview, "property", "properties")} flagged for review · renewal and service thresholds
            compare each property with all others pooled
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-5 py-2.5 font-medium">Property</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium"><MetricLabel id="occupancy" /></th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium"><MetricLabel id="renewalRate">Renewal rate (90d)</MetricLabel></th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium"><MetricLabel id="openWorkOrders">Open WOs</MetricLabel></th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium"><MetricLabel id="medianOpenWorkOrderAge">Median open WO age</MetricLabel></th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium"><MetricLabel id="upcomingExpirations">Expiring ≤60d</MetricLabel></th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium"><MetricLabel id="flaggedResidents">Flagged residents</MetricLabel></th>
                <th scope="col" className="px-5 py-2.5"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.property.id} className={cx("border-b border-line last:border-0", p.review.needsReview && "bg-warn-soft/50")}>
                  <td className={cx("px-5 py-3", p.review.needsReview && "border-l-4 border-l-warn")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.property.neighborhood}</span>
                      {p.review.needsReview && <Badge tone="warn">⚑ Needs review</Badge>}
                    </div>
                    <div className="text-xs text-ink-faint">{p.property.name} · {p.property.unitCount} units</div>
                    {p.review.needsReview && (
                      <ul className="mt-1 text-xs text-warn">
                        {p.review.reasons.map((r) => <li key={r}>{r}</li>)}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtPct(p.occupancy.value)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className={cx(p.review.needsReview && "font-semibold text-warn")}>{fmtPct(p.renewal.value)}</span>
                    <div className="text-xs text-ink-faint">{p.renewal.renewed} of {p.renewal.denominator}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{p.openWorkOrders.count}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtDays(p.medianOpenWorkOrderAgeDays)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{p.upcomingExpirations.count}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{p.flaggedResidentCount}</td>
                  <td className="px-5 py-3 text-right">
                    <ButtonLink
                      href={`/properties/${p.property.id}`}
                      variant={p.review.needsReview ? "primary" : "secondary"}
                      size="sm"
                      aria-label={`Investigate ${p.property.neighborhood}`}
                    >
                      Investigate
                    </ButtonLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="divide-y divide-line md:hidden">
          {rows.map((p) => (
            <li key={p.property.id} className={cx("p-4", p.review.needsReview && "border-l-4 border-l-warn bg-warn-soft/50")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.property.neighborhood}</span>
                    {p.review.needsReview && <Badge tone="warn">⚑ Needs review</Badge>}
                  </div>
                  <div className="text-xs text-ink-faint">{p.property.name}</div>
                </div>
                <ButtonLink href={`/properties/${p.property.id}`} variant={p.review.needsReview ? "primary" : "secondary"} size="sm" aria-label={`Investigate ${p.property.neighborhood}`}>
                  Investigate
                </ButtonLink>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-ink-faint">Occupancy</dt><dd className="font-medium">{fmtPct(p.occupancy.value)}</dd></div>
                <div><dt className="text-ink-faint">Renewal (90d)</dt><dd className="font-medium">{fmtPct(p.renewal.value)} <span className="text-ink-faint">({p.renewal.renewed}/{p.renewal.denominator})</span></dd></div>
                <div><dt className="text-ink-faint">Open WOs</dt><dd className="font-medium">{p.openWorkOrders.count}</dd></div>
                <div><dt className="text-ink-faint">Median open age</dt><dd className="font-medium">{fmtDays(p.medianOpenWorkOrderAgeDays)}</dd></div>
                <div><dt className="text-ink-faint">Expiring ≤60d</dt><dd className="font-medium">{p.upcomingExpirations.count}</dd></div>
                <div><dt className="text-ink-faint">Flagged</dt><dd className="font-medium">{p.flaggedResidentCount}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs leading-relaxed text-ink-faint">
        Occupancy uses each property’s unit counts as of {asOf}. Lease, work-order and feedback metrics use the
        renewal-cycle cohort in the dataset ({dataset.leases.length} leases, {dataset.workOrders.length} work orders,{" "}
        {dataset.feedback.length} feedback records, {dataset.interactions.length} outreach records), not every unit.
        Hover or focus the ⓘ icons for definitions.
      </p>
    </div>
  );
}
