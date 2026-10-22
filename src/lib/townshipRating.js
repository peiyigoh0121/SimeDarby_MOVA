export const TOWNSHIP_RATING_CONFIG = Object.freeze({
  minimumCompleteRecords: 10,
  minimumCoveragePercent: 80,
  bronzeMinimumScore: 60,
  silverMinimumScore: 75,
  goldMinimumScore: 90,
})

const VALID_STATUSES = new Set(['reported', 'assigned', 'fixed', 'verified'])

function uniqueIssues(issues) {
  const ids = new Set()
  return (Array.isArray(issues) ? issues : []).filter((issue) => {
    if (issue?.id === null || issue?.id === undefined || issue?.id === '' || ids.has(issue.id)) return false
    ids.add(issue.id)
    return true
  })
}

function validCoordinate(value, min, max) {
  return value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max
}

function validSeverity(value) {
  return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5
}

function hasFiniteMeasurement(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function needsRampMeasurement(issue) {
  return String(issue?.type || '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'ramp'
}

export function isCompleteRatingRecord(issue) {
  const type = String(issue?.type || '').trim().toLowerCase()
  if (!type || type === 'unknown' || !validCoordinate(issue.lat, -90, 90) || !validCoordinate(issue.lng, -180, 180)) return false
  if (!VALID_STATUSES.has(String(issue.status || '').trim().toLowerCase())) return false
  if (!validSeverity(issue.severity) || !Number.isFinite(Date.parse(issue.created_at))) return false
  // Ramp records are the only records with a measurement field in the live schema.
  // A missing slope is incomplete evidence, never evidence of accessibility.
  return !needsRampMeasurement(issue) || hasFiniteMeasurement(issue.slope_degrees)
}

function badgeFor(score, config) {
  if (score >= config.goldMinimumScore) return 'gold'
  if (score >= config.silverMinimumScore) return 'silver'
  if (score >= config.bronzeMinimumScore) return 'bronze'
  return null
}

/**
 * Project indicator formula:
 * coverage = complete unique records / all unique records.
 * score = 100 - 100 * (severity weight of non-verified records / severity weight of complete records).
 * Only verified records count as resolved; fixed records still await verification.
 */
export function calculateTownshipAccessibilityRating(issues, configOverrides = {}) {
  const config = { ...TOWNSHIP_RATING_CONFIG, ...configOverrides }
  const allRecords = uniqueIssues(issues)
  const completeRecords = allRecords.filter(isCompleteRatingRecord)
  const coveragePercent = allRecords.length === 0 ? 0 : (completeRecords.length / allRecords.length) * 100

  if (completeRecords.length < config.minimumCompleteRecords || coveragePercent < config.minimumCoveragePercent) {
    return {
      state: 'insufficient_data',
      score: null,
      badge: null,
      totalRecords: allRecords.length,
      completeRecords: completeRecords.length,
      coveragePercent: Math.round(coveragePercent),
      reason: `Requires at least ${config.minimumCompleteRecords} complete records and ${config.minimumCoveragePercent}% coverage.`,
    }
  }

  const totalSeverityWeight = completeRecords.reduce((sum, issue) => sum + Number(issue.severity), 0)
  const unresolvedSeverityWeight = completeRecords
    .filter((issue) => String(issue.status).trim().toLowerCase() !== 'verified')
    .reduce((sum, issue) => sum + Number(issue.severity), 0)
  const score = Math.round(100 - ((unresolvedSeverityWeight / totalSeverityWeight) * 100))
  const badge = badgeFor(score, config)

  return {
    state: 'rated',
    score,
    badge,
    totalRecords: allRecords.length,
    completeRecords: completeRecords.length,
    coveragePercent: Math.round(coveragePercent),
    unresolvedSeverityWeight,
    totalSeverityWeight,
    reason: badge
      ? `${badge[0].toUpperCase()}${badge.slice(1)} criteria met.`
      : 'Coverage criteria met, but the unresolved-issue score is below Bronze.',
  }
}
