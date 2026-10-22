export const EMERGENCY_ALERT_INTEGRATION_STATUS = 'unavailable'

const SOURCES = new Set(['manual_safety_control', 'microphone_peak_detector'])

/**
 * Represents a local UI observation only. It is deliberately not an alert record
 * and does not imply delivery, dispatch, or emergency confirmation.
 */
export function createUnconfirmedEmergencySafetyEvent({ source, observedAt } = {}) {
  const timestamp = Date.parse(observedAt)
  return {
    state: 'unconfirmed_local_event',
    source: SOURCES.has(source) ? source : 'unknown',
    observedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
    location: null,
    deliveryStatus: 'not_sent',
  }
}

export function getEmergencyAlertIntegrationStatus() {
  return {
    status: EMERGENCY_ALERT_INTEGRATION_STATUS,
    message: 'No shared emergency-alert source or dispatch API is configured. No alert has been sent.',
    requires: ['persisted alert source', 'authorised create action', 'status/acknowledgement feed'],
  }
}
