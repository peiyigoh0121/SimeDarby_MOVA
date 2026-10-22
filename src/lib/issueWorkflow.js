export const ISSUE_WORKFLOW_STATUSES = Object.freeze([
  'reported',
  'assigned',
  'fixed',
  'verified',
])

function normalizeStatus(status) {
  return typeof status === 'string' ? status.trim().toLowerCase() : ''
}

function isValidTimestamp(value) {
  return Number.isFinite(Date.parse(value))
}

export function hasNewConfirmingVerificationMeasurement(measurement, fixedAt) {
  if (
    measurement?.measurementType !== 'verification'
    || measurement?.confirmsFixed !== true
    || !isValidTimestamp(measurement.recordedAt)
    || !isValidTimestamp(fixedAt)
  ) {
    return false
  }

  return Date.parse(measurement.recordedAt) > Date.parse(fixedAt)
}

export function getAllowedNextStatuses(currentStatus, evidence = {}) {
  const status = normalizeStatus(currentStatus)
  if (status === 'reported') return ['assigned']
  if (status === 'assigned') return ['fixed']
  if (status === 'fixed' && hasNewConfirmingVerificationMeasurement(
    evidence.verificationMeasurement,
    evidence.fixedAt,
  )) {
    return ['verified']
  }
  return []
}

export function validateIssueStatusTransition({ currentStatus, nextStatus, evidence } = {}) {
  const status = normalizeStatus(currentStatus)
  const targetStatus = normalizeStatus(nextStatus)

  if (!ISSUE_WORKFLOW_STATUSES.includes(status)) {
    return { ok: false, error: 'Current status requires triage before it can enter the workflow.' }
  }
  if (!ISSUE_WORKFLOW_STATUSES.includes(targetStatus)) {
    return { ok: false, error: 'Target status is not part of the approved workflow.' }
  }
  if (!getAllowedNextStatuses(status, evidence).includes(targetStatus)) {
    if (status === 'fixed' && targetStatus === 'verified') {
      return { ok: false, error: 'Verified requires a new confirming verification measurement recorded after the issue was fixed.' }
    }
    return { ok: false, error: `Only the next workflow status after ${status} is allowed.` }
  }

  return { ok: true, error: null }
}

export function getIssueWorkflow(issue, evidence) {
  const status = normalizeStatus(issue?.status)
  const currentIndex = ISSUE_WORKFLOW_STATUSES.indexOf(status)
  const allowedNextStatuses = getAllowedNextStatuses(status, evidence)

  let guidance = 'Status requires triage before it can enter the approved workflow.'
  if (status === 'reported') guidance = 'Next permitted transition: Assigned.'
  if (status === 'assigned') guidance = 'Next permitted transition: Fixed.'
  if (status === 'fixed') {
    guidance = allowedNextStatuses.includes('verified')
      ? 'A post-fix verification measurement is available for review.'
      : 'Verified is blocked until a new post-fix measurement confirms the issue is fixed.'
  }
  if (status === 'verified') guidance = 'Verified issues are closed and have no further workflow transition.'

  return {
    status: currentIndex === -1 ? 'needs triage' : status,
    currentIndex,
    allowedNextStatuses,
    guidance,
  }
}
