# Product memo: renewal-risk service triage (prototype)

*Independent prototype on synthetic data. One page.*

**Operator pain.** Regional managers see renewal rates only after decisions are made. The early signals (repeat repairs, low survey scores, unanswered renewal offers) are spread across the PMS, the maintenance tool, the survey tool and email. Teams find out why a resident left in the move-out survey, when it's too late to act.

**Hypothesis.** At properties where service response has slipped, some renewal loss is associated with residents who have repeat, unresolved issues. Resolving those issues before renewal outreach continues may recover some renewals, and it costs less than concessions.

**Prioritization.** Focus on (1) properties whose renewal rate trails the rest of the portfolio, then (2) residents with pending renewals in the next 90 days and service signals, ordered by transparent points. Pricing-driven declines are out of scope; the tool should help separate them from service-driven ones rather than treat every decline the same way.

**MVP (this prototype).** Portfolio view with a review rule, an evidence packet with denominators and source IDs, a flagged-resident list, Resident 360, and manager-approved actions (simulated): a maintenance escalation when a work order is open, or a feedback follow-up when the concern isn't a ticket. Drafts state only what the records show. The measurement plan is defined up front.

**Adoption and impact metrics.**
- Adoption: share of flags reviewed within 3 days, escalations approved, drafts edited vs. rejected.
- Operational: time from escalation to resolution; share of flagged issues resolved before the renewal decision.
- Outcome: flagged-cohort renewal rate at +30/+60 days against a comparison group. Directional until the pilot spans enough properties.

**Validation interview questions.**
1. When renewals dip, what do you check first, and in which system?
2. How do you currently learn that a resident has had repeat maintenance problems?
3. Who can escalate a work order, and what does "escalate" actually trigger?
4. Would you trust a rule you can read over a score you can't? What would make you ignore a flag?
5. What would you need to see to believe this changed a renewal outcome?

**What becomes reusable across operators.** The entity model and semantic layer (definitions of renewal rate, work-order age and flag rules), the evidence-packet contract, and the draft → approve → write-back → measure loop. Per-operator work is mostly connectors, identity resolution, and tuning thresholds with each operator's teams.
