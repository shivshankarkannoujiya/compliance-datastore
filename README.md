# compliance-datastore

Rules and scoring engine for the compliance data store. It replaces the calculations in
`Z:\Performance Dashboards and Data\Data Store\Compliance Data.xlsm` that drive the PW and MP Power BI dashboards.

This is step 1 of the build: the logic, with tests. It has no database, API or import adapters yet; those are
later modules that call this one.

The source analysis is in the `Compliance_Reverse` repository:
- `00_Overview/Compliance_Data_Store_Logic.pdf`: every formula of the workbook, cited below as **DSL §n** and findings **DS-nn**.
- `0N_*/…PreBuild_Client_Requirements.pdf`: the client decisions still open.

## Layout

```
src/
  shared/              dates (EDATE, WORKDAY), Excel rounding, text matching          — pure TypeScript
  compliance-rules/    catalogue, requirements, records, the policy, per-record rules — pure TypeScript
  scoring/             type → sub group → group roll-up, scoreCompliance()          — pure TypeScript
  compliance-scoring/  NestJS module + ComplianceScoringService (the only Nest code)
```

`npm run lint:arch` (dependency-cruiser) enforces the boundary: `shared`, `compliance-rules` and `scoring` may not import
NestJS, any npm package or Node built-ins, rules may not import scoring, and there are no cycles.

## Usage

```ts
@Module({ imports: [ComplianceScoringModule] })            // Excel parity policy
// or ComplianceScoringModule.forRoot({ policy: myPolicy })

const result = scoringService.score({ asOf: '2026-10-16', catalogue, requirements, records });
// result.records       latest record per subject and type, with compliant / expiry / weeks non compliant
// result.requirements  each requirement joined to its latest record (Due Date, Compliance, Compliance (Core))
// result.types / subGroups / groups   percentages and RAG scores (0–1)
// result.warnings      ambiguous latest records (DS-01), requirement types missing from the catalogue
```

Dates are ISO strings (`YYYY-MM-DD`) with no time zone. `asOf` replaces `TODAY()`, so any past score can be reproduced.

## What maps to what

| Workbook (tab 04 row) | Here |
|---|---|
| Most Recent Record, Unique Lookups 1–4 (191, 196–199) | `selectLatestRecords` |
| Compliant (192) | `evaluateRecord` → rule `ISSUE_SCORE`, `COMPLETION_STATUS` or `DUE_DATE` by Level 2 group |
| Expires within 3 months / 2 weeks (193) | `evaluateRecord().expiry` |
| Weeks Non Compliant (194) | `evaluateRecord().weeksNonCompliant` |
| Due Date, Compliance Status, Completion Status, Compliance, Compliance (Core) (212–217) | `evaluateRequirements` |
| Type % Compliant and RAG (218–221) | `scoreTypes` |
| Sub-group % and RAG, incl. Incidents and HR Metrics rules (234–235, 243–244) | `scoreSubGroups` |
| Group % and RAG (236–237, 245–246) | `scoreGroups` |

Not carried over: the Encoded and Rank columns, Snapshot and Column1 (purpose unknown, DS-17), and the
self-referencing query (DS-09), which a single calculation pass replaces.

## Policy: open client decisions are settings

`EXCEL_PARITY_POLICY` reproduces the workbook. Each open decision is a field, so the answer becomes a new policy version
rather than a code change, and results record the `policyVersion` they used.

| Setting | Workbook behaviour | Finding |
|---|---|---|
| `rules.dueDate.blankDueDateCompliant` | `true`: a blank due date is compliant | DS-02 |
| `rules.completionStatus.lapseAtDueDate` | `false`: Training stays compliant after expiry | DS-03 |
| `latestRecord.tieBreak` | `FIRST_ENTERED` (XLOOKUP returns the first match) | DS-01 |
| `expiry.includeOverdue` | `true`: overdue items are also "expiring" | DS-04 |
| `scoring.ragExcludedSubGroups` | `['Accreditation']` | DS-13 |
| `scoring.incidents.*`, `scoring.spcRule.*` | Incidents and HR Metrics rules as written | DS-07 |
| `rules.issueScore.groups`, `rules.completionStatus.groups` | Issue = 10 for Incidents, Feedback, HR Metrics, Complications; Completion Status for Training | DSL §3 |

## Deliberate differences from the workbook

These are where the workbook's result depends on row order or produces an artefact; each is covered by a test.

1. **One latest record.** Ties pick one record by the tie-break and raise a warning, instead of several rows all
   marked "most recent" (DS-01).
2. **Weeks Non Compliant is null without a due date**, instead of about 6,600 weeks from `TODAY() − 0` (DS-05).
   Negative weeks for an Issue failure with a future due date are kept.
3. **Grouping uses Group + Sub Group everywhere.** The workbook mixes sub-group-name-only and group+sub-group keys; the
   results differ only if a sub-group name is reused under two groups.
4. **Group RAG has no sub-group exclusion.** The workbook's check reads the sub group of whichever row comes first in a
   group (DS-13, DS-14); this needs a client decision before it can be modelled.
5. **Threshold comparison tolerates 1e-9** so floating-point averages such as 0.8999999999 still meet a 0.9 threshold.

Kept as in the workbook even though questionable: the core variant of the Incidents/HR rules uses the all-requirements
type RAG, and thresholds are averaged per requirement row, so types with more requirements weigh more.

## Next steps

1. **Parity harness**: load a copy of Compliance Data.xlsm (pre-build item F-02), run `scoreCompliance` with
   `EXCEL_PARITY_POLICY` and compare every Compliant, %, and RAG value with the workbook's.
2. Persistence modules (subjects, catalogue, requirements, append-only evidence, publishing) and the Power BI views,
   following the appointment data store's conventions.

## Scripts

```
npm ci
npm run check        # typecheck + architecture rules + tests
npm run test:cov
npm run build
```
