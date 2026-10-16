/**
 * Every business rule the client still has to confirm is a setting here, not code (see the pre-build checklists and
 * 00_Overview/Compliance_Data_Store_Logic.pdf in the Compliance_Reverse repository). Changing a decision means
 * publishing a new policy version, so past scores stay reproducible.
 *
 * EXCEL_PARITY_POLICY reproduces the legacy workbook, including the behaviour the findings question.
 */
export interface CompliancePolicy {
  version: string;
  rules: {
    /** Level 2 groups judged by the Issue score (tab 04 row 192). */
    issueScore: { groups: readonly string[]; compliantValue: number };
    /** Level 2 groups judged by a filled-in Completion Status. */
    completionStatus: {
      groups: readonly string[];
      /** DS-03: the workbook ignores the due date for these groups. */
      lapseAtDueDate: boolean;
    };
    /** All other groups: compliant while the due date is after the as-of date. */
    dueDate: {
      /** DS-02: the workbook treats a blank due date as compliant. */
      blankDueDateCompliant: boolean;
    };
  };
  latestRecord: {
    /**
     * DS-01: which record wins when several share the latest completion date (or none has one).
     * The workbook's XLOOKUP returns the first entered.
     */
    tieBreak: 'FIRST_ENTERED' | 'LAST_ENTERED';
  };
  expiry: {
    windowMonths: number;
    /** Level 2 groups that use the short window ("Ongoing Audit": 10 working days). */
    shortWindowGroups: readonly string[];
    shortWindowWorkdays: number;
    /** DS-04: the workbook also flags items that are already overdue. */
    includeOverdue: boolean;
  };
  scoring: {
    /** Scores for Thresholds 1–5; below Threshold 5 scores 0. */
    bandScores: readonly [number, number, number, number, number];
    /** Gate penalty by number of types at 0 % in a sub group; the last value applies to any higher count. */
    zeroTypePenalty: readonly number[];
    /** Sub groups left out of sub-group and group percentages. */
    percentExcludedSubGroups: readonly string[];
    /** Sub groups that get no sub-group RAG score (DS-13: "Accreditation" vs "Accreditation Prep"). */
    ragExcludedSubGroups: readonly string[];
    incidents: {
      subGroup: string;
      /** Type names containing this text are SPC measures. */
      spcMarker: string;
      /** Type names containing this text are exempt from the "any other failure scores 0" rule. */
      moderateMarker: string;
      moderateHarmType: string;
      /** Score when exactly one Moderate Harm type fails (DS-07: two failures fall through to the SPC rules). */
      singleModerateHarmScore: number;
    };
    spcRule: {
      /** Sub groups scored by SPC failures alone (besides Incidents' own SPC steps). */
      subGroups: readonly string[];
      twoOrMoreFailuresScore: number;
      oneFailureScore: number;
    };
  };
}

export const EXCEL_PARITY_POLICY: CompliancePolicy = {
  version: 'excel-parity-1',
  rules: {
    issueScore: { groups: ['Incidents', 'Feedback', 'HR Metrics', 'Complications'], compliantValue: 10 },
    completionStatus: { groups: ['Training'], lapseAtDueDate: false },
    dueDate: { blankDueDateCompliant: true },
  },
  latestRecord: { tieBreak: 'FIRST_ENTERED' },
  expiry: { windowMonths: 3, shortWindowGroups: ['Ongoing Audit'], shortWindowWorkdays: 10, includeOverdue: true },
  scoring: {
    bandScores: [1, 0.8, 0.6, 0.4, 0.2],
    zeroTypePenalty: [0, 0.3, 0.6, 0.9, 1],
    percentExcludedSubGroups: ['Onboarding'],
    ragExcludedSubGroups: ['Accreditation'],
    incidents: {
      subGroup: 'Incidents',
      spcMarker: 'SPC',
      moderateMarker: 'Moderate',
      moderateHarmType: 'Moderate Harm',
      singleModerateHarmScore: 0.5,
    },
    spcRule: { subGroups: ['HR Metrics'], twoOrMoreFailuresScore: 0.5, oneFailureScore: 0.8 },
  },
};
