export const DEFAULT_DISTANCE_THRESHOLD_METERS = 30

function normalizeIssueType(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : ''
}

function validCoordinates(report) {
  return report?.lat !== null && report?.lat !== undefined && report?.lat !== ''
    && report?.lng !== null && report?.lng !== undefined && report?.lng !== ''
    && Number.isFinite(Number(report.lat)) && Number.isFinite(Number(report.lng))
}

function distanceInMeters(first, second) {
  const earthRadiusMeters = 6371000
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(Number(second.lat) - Number(first.lat))
  const longitudeDelta = toRadians(Number(second.lng) - Number(first.lng))
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(Number(first.lat))) * Math.cos(toRadians(Number(second.lat)))
    * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function insufficient(reason, extra = {}) {
  return { state: 'insufficient_evidence', reason, reportCount: null, ...extra }
}

function uniqueReports(reports) {
  const seenIds = new Set()
  return (Array.isArray(reports) ? reports : []).filter((report) => {
    const id = report?.id
    if (id === null || id === undefined || id === '' || seenIds.has(id)) return false
    seenIds.add(id)
    return true
  })
}

/**
 * Counts only reports with a caller-supplied, persisted independence key.
 * An ordinary database row ID proves uniqueness of a row, not independence of a report.
 */
export function evaluateConfidenceCount(targetReport, reports, {
  distanceThresholdMeters = DEFAULT_DISTANCE_THRESHOLD_METERS,
  areIssueTypesCompatible = (first, second) => normalizeIssueType(first) === normalizeIssueType(second),
  getIndependentReporterKey,
} = {}) {
  if (!validCoordinates(targetReport)) return insufficient('The selected report has no verifiable coordinates.')
  if (!Number.isFinite(distanceThresholdMeters) || distanceThresholdMeters <= 0) {
    return insufficient('The geographic distance threshold is invalid.')
  }
  if (typeof getIndependentReporterKey !== 'function') {
    return insufficient('Independent reporter evidence is not available in the current data.')
  }

  const matchingReports = uniqueReports(reports).filter((report) => (
    validCoordinates(report)
    && areIssueTypesCompatible(targetReport.type, report.type)
    && distanceInMeters(targetReport, report) <= distanceThresholdMeters
  ))
  const independentKeys = new Set()
  const supportingReportIds = []
  for (const report of matchingReports) {
    const key = getIndependentReporterKey(report)
    if (typeof key !== 'string' && typeof key !== 'number') continue
    const normalizedKey = String(key).trim()
    if (!normalizedKey || independentKeys.has(normalizedKey)) continue
    independentKeys.add(normalizedKey)
    supportingReportIds.push(report.id)
  }

  if (independentKeys.size < 2) {
    return insufficient('Fewer than two independently identified, compatible reports agree at this location.', {
      supportingReportIds,
    })
  }

  return {
    state: 'confirmed_report_count',
    reportCount: independentKeys.size,
    supportingReportIds,
    distanceThresholdMeters,
    // This is intentionally a count, not a probability or statistical confidence interval.
    confidenceProbability: null,
  }
}

/**
 * Keeps escalation separate from priority and workflow. It needs both verified
 * independent reporters and at least two distinct persisted signal types.
 */
export function evaluateMultiSignalEscalation(targetReport, reports, options = {}) {
  const confidence = evaluateConfidenceCount(targetReport, reports, options)
  if (confidence.state !== 'confirmed_report_count') {
    return {
      state: 'insufficient_evidence',
      reason: confidence.reason,
      supportingSignalCount: null,
      supportingReportIds: confidence.supportingReportIds || [],
    }
  }
  if (typeof options.getSignalType !== 'function') {
    return {
      state: 'insufficient_evidence',
      reason: 'Persisted signal types are not available, so independent signal agreement cannot be verified.',
      supportingSignalCount: null,
      supportingReportIds: confidence.supportingReportIds,
    }
  }

  const signalTypes = new Set()
  for (const report of uniqueReports(reports)) {
    if (!confidence.supportingReportIds.includes(report.id)) continue
    const signalType = options.getSignalType(report)
    if (typeof signalType === 'string' && signalType.trim()) signalTypes.add(signalType.trim().toLowerCase())
  }
  if (signalTypes.size < 2) {
    return {
      state: 'not_escalated',
      reason: 'At least two independent, compatible signal types are required for escalation.',
      supportingSignalCount: signalTypes.size,
      supportingReportIds: confidence.supportingReportIds,
    }
  }
  return {
    state: 'escalated',
    reason: `Escalated from ${signalTypes.size} independent, compatible signals at the same location.`,
    supportingSignalCount: signalTypes.size,
    supportingReportIds: confidence.supportingReportIds,
  }
}
