const ENFORCEMENT_TYPES = new Set([
  'blocked_tactile_paving',
])

const MAINTENANCE_TYPES = new Set([
  'ramp',
  'broken_tactile_paving',
  'missing_handrail',
  'step_at_entrance',
  'lift_out_of_service',
  'drain_or_crossing',
  'pickup_point',
])

function normalizeIssueType(type) {
  return typeof type === 'string'
    ? type.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : ''
}

export function classifyIssueQueue(issue) {
  const type = normalizeIssueType(issue?.type)
  if (ENFORCEMENT_TYPES.has(type)) return 'enforcement'
  if (MAINTENANCE_TYPES.has(type)) return 'maintenance'
  return 'unclassified'
}

export function buildIssueQueues(rankedIssues) {
  const queues = {
    maintenance: [],
    enforcement: [],
    unclassified: [],
  }

  for (const entry of Array.isArray(rankedIssues) ? rankedIssues : []) {
    if (entry.priority?.state === 'resolved') continue

    const queue = classifyIssueQueue(entry.issue)
    queues[queue].push(entry)
  }

  return queues
}
