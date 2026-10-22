import assert from 'node:assert/strict'
import test from 'node:test'
import { createUnconfirmedEmergencySafetyEvent, getEmergencyAlertIntegrationStatus } from './emergencyAlertIntegration.js'

test('a microphone peak is an unconfirmed local event, not a dispatched alert', () => {
  const event = createUnconfirmedEmergencySafetyEvent({
    source: 'microphone_peak_detector',
    observedAt: '2026-10-22T10:00:00.000Z',
  })
  assert.deepEqual(event, {
    state: 'unconfirmed_local_event',
    source: 'microphone_peak_detector',
    observedAt: '2026-10-22T10:00:00.000Z',
    location: null,
    deliveryStatus: 'not_sent',
  })
})

test('the missing integration never reports delivery', () => {
  const status = getEmergencyAlertIntegrationStatus()
  assert.equal(status.status, 'unavailable')
  assert.match(status.message, /No alert has been sent/)
})
