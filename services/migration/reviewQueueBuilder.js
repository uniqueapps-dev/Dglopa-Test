/**
 * DGLOPA PLATFORM — IME — REVIEW QUEUE BUILDER
 * Assembles validation issues into an in-memory Review Queue structure
 * matching the ReviewQueue table schema, so it can be persisted directly
 * in a future ticket (DT-003B) without remapping fields.
 *
 * IMPORTANT: DT-003A makes ZERO database writes. Nothing here touches
 * db.ReviewQueue. The shape is prepared so the future persistence step
 * is a simple bulkAdd().
 */

/**
 * Build review queue entries from validation issues.
 * @param {ValidationIssue[]} issues
 * @returns {ReviewQueueEntry[]}
 */
export function buildReviewQueue(issues) {
  return issues.map((issue) => ({
    id:                   `RQ-LOCAL-${issue.id}`,
    category:             issue.category,
    severity:             issue.severity,
    assignedTo:           null,
    dueDate:              null,
    status:               'Pending',
    notes:                `${issue.description} ${issue.suggestedResolution}`.trim(),
    rowIndex:             issue.rowIndex,
    description:          issue.description,
    suggestedResolution:  issue.suggestedResolution,
  }));
}

/**
 * Group review queue entries by workbook row, for row-level UI display.
 * @param {ReviewQueueEntry[]} entries
 * @returns {Map<number, ReviewQueueEntry[]>}
 */
export function groupByRow(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (!map.has(entry.rowIndex)) map.set(entry.rowIndex, []);
    map.get(entry.rowIndex).push(entry);
  }
  return map;
}

/**
 * Summarize review queue entries by category and severity — used in the
 * Import Preview screen.
 * @param {ReviewQueueEntry[]} entries
 */
export function summarizeQueue(entries) {
  const summary = {
    totalIssues:  entries.length,
    errorCount:   entries.filter((e) => e.severity === 'error').length,
    warningCount: entries.filter((e) => e.severity === 'warning').length,
    byCategory:   {},
  };

  for (const entry of entries) {
    summary.byCategory[entry.category] = (summary.byCategory[entry.category] ?? 0) + 1;
  }

  return summary;
}
