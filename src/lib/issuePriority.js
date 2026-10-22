const ACTIVE_STATUSES = new Set(['reported', 'assigned'])
const RESOLVED_STATUSES = new Set(['fixed', 'verified'])
const DAY_IN_MS = 24 * 60 * 60 * 1000

function toIntegerInRange(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < minimum || number > maximum) return null
  return number
}

function normalizeStatus(status) {
  return typeof status === 'string' ? status.trim().toLowerCase() : ''
}

function roundScore(value) {
  return Math.round(value * 10) / 10
}

export function calculateDaysUnfixed(createdAt, now = new Date()) {
  const createdAtMs = Date.parse(createdAt)
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN

  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs) || createdAtMs > nowMs) {
    return null
  }

  return Math.floor((nowMs - createdAtMs) / DAY_IN_MS)
}

export function adaptIssuePriorityInputs(issue) {
  return {
    severity: issue?.severity,
    pedestrianTraffic: issue?.priorityInputs?.pedestrianTraffic,
    roadDanger: issue?.priorityInputs?.roadDanger,
    createdAt: issue?.created_at,
    status: issue?.status,
  }
}

export function scoreIssuePriority(input, { now = new Date() } = {}) {
  const status = normalizeStatus(input?.status)

  if (RESOLVED_STATUSES.has(status)) {
    return {
      state: 'resolved',
      score: 0,
      daysUnfixed: 0,
      missingFields: [],
      factors: null,
    }
  }

  const severity = toIntegerInRange(input?.severity, 1, 5)
  const pedestrianTraffic = toIntegerInRange(input?.pedestrianTraffic, 1, 5)
  const roadDanger = toIntegerInRange(input?.roadDanger, 0, 5)
  const daysUnfixed = calculateDaysUnfixed(input?.createdAt, now)
  const missingFields = []

  if (!ACTIVE_STATUSES.has(status)) missingFields.push('status')
  if (severity === null) missingFields.push('severity')
  if (pedestrianTraffic === null) missingFields.push('pedestrian traffic')
  if (roadDanger === null) missingFields.push('road danger')
  if (daysUnfixed === null) missingFields.push('reported date')

  if (missingFields.length > 0) {
    return {
      state: 'needs_triage',
      score: null,
      daysUnfixed: null,
      missingFields,
      factors: null,
    }
  }

  const factors = {
    severity: ((severity - 1) / 4) * 100,
    pedestrianTraffic: ((pedestrianTraffic - 1) / 4) * 100,
    roadDanger: (roadDanger / 5) * 100,
    age: (Math.min(daysUnfixed, 30) / 30) * 100,
  }
  const score = (
    factors.severity * 0.45
    + factors.pedestrianTraffic * 0.25
    + factors.roadDanger * 0.20
    + factors.age * 0.10
  )

  return {
    state: 'scored',
    score: roundScore(score),
    daysUnfixed,
    missingFields: [],
    factors,
  }
}

export function sortIssuesByPriority(issues, options) {
  const stateOrder = { scored: 0, needs_triage: 1, resolved: 2 }

  return (Array.isArray(issues) ? issues : [])
    .map((issue, index) => ({
      issue,
      priority: scoreIssuePriority(adaptIssuePriorityInputs(issue), options),
      index,
    }))
    .sort((left, right) => {
      const stateDifference = stateOrder[left.priority.state] - stateOrder[right.priority.state]
      if (stateDifference !== 0) return stateDifference

      if (left.priority.state === 'scored' && left.priority.score !== right.priority.score) {
        return right.priority.score - left.priority.score
      }

      return left.index - right.index
    })
}
