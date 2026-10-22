import { classifyIssueQueue } from './issueQueues.js'
import { ISSUE_WORKFLOW_STATUSES } from './issueWorkflow.js'

export const SS2_DEMO_AREA_BOUNDS = Object.freeze({
  minLat: 3.115,
  maxLat: 3.122,
  minLng: 101.618,
  maxLng: 101.624,
})

const ACCEPTED_TYPES = new Set([
  'ramp',
  'blocked_tactile_paving',
  'broken_tactile_paving',
  'missing_handrail',
  'step_at_entrance',
  'lift_out_of_service',
  'drain_or_crossing',
  'pickup_point',
])

function isCoordinateInDemoArea(record) {
  return Number.isFinite(record?.lat) && Number.isFinite(record?.lng)
    && record.lat >= SS2_DEMO_AREA_BOUNDS.minLat && record.lat <= SS2_DEMO_AREA_BOUNDS.maxLat
    && record.lng >= SS2_DEMO_AREA_BOUNDS.minLng && record.lng <= SS2_DEMO_AREA_BOUNDS.maxLng
}

function hasFiniteValue(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

/** Validates review-only demo data; it never sends records to Supabase. */
export function validateFictionalMovaDemoData(dataset) {
  const errors = []
  if (!String(dataset?.datasetLabel || '').includes('FICTIONAL')) {
    errors.push('Dataset must be explicitly labelled FICTIONAL.')
  }
  const records = Array.isArray(dataset?.records) ? dataset.records : []
  if (records.length === 0) errors.push('Dataset has no records.')

  const queueCounts = { maintenance: 0, enforcement: 0, unclassified: 0 }
  records.forEach((entry, index) => {
    const record = entry?.movaRecord
    const location = `Record ${index + 1}`
    if (!record || typeof record !== 'object') {
      errors.push(`${location} has no MOVA record.`)
      return
    }
    if (!ACCEPTED_TYPES.has(record.type)) errors.push(`${location} has an unsupported issue type.`)
    if (!ISSUE_WORKFLOW_STATUSES.includes(record.status)) errors.push(`${location} has an unsupported workflow status.`)
    if (!isCoordinateInDemoArea(record)) errors.push(`${location} is outside the SS2 demo bounds or cannot appear on the map.`)
    const severity = Number(record.severity)
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) errors.push(`${location} has invalid severity.`)
    if (!Number.isFinite(Date.parse(record.created_at))) errors.push(`${location} has an invalid timestamp.`)
    if (record.type === 'ramp' && !hasFiniteValue(record.slope_deg)) errors.push(`${location} needs a numeric ramp slope.`)
    if (record.type !== 'ramp' && record.slope_deg !== null) errors.push(`${location} should not invent a non-ramp slope measurement.`)
    if (entry?.demoPriorityInputs && (
      !Number.isInteger(entry.demoPriorityInputs.pedestrianTraffic)
      || entry.demoPriorityInputs.pedestrianTraffic < 1 || entry.demoPriorityInputs.pedestrianTraffic > 5
      || !Number.isInteger(entry.demoPriorityInputs.roadDanger)
      || entry.demoPriorityInputs.roadDanger < 0 || entry.demoPriorityInputs.roadDanger > 5
    )) errors.push(`${location} has invalid demo-only priority inputs.`)

    const queue = classifyIssueQueue(record)
    queueCounts[queue] += 1
    if (queue === 'unclassified') errors.push(`${location} is not accepted by an existing issue queue.`)
  })

  return { ok: errors.length === 0, errors, recordCount: records.length, queueCounts }
}
