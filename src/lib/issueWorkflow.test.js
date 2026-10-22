import assert from 'node:assert/strict'
import test from 'node:test'
import { getAllowedNextStatuses, validateIssueStatusTransition } from './issueWorkflow.js'

test('allows only forward workflow transitions', () => {
  assert.deepEqual(getAllowedNextStatuses('reported'), ['assigned'])
  assert.deepEqual(getAllowedNextStatuses('assigned'), ['fixed'])
  assert.equal(validateIssueStatusTransition({ currentStatus: 'assigned', nextStatus: 'verified' }).ok, false)
})

test('requires a later confirming verification measurement before verified', () => {
  const fixedAt = '2026-10-20T10:00:00.000Z'
  assert.equal(validateIssueStatusTransition({ currentStatus: 'fixed', nextStatus: 'verified', evidence: { fixedAt } }).ok, false)
  assert.equal(validateIssueStatusTransition({
    currentStatus: 'fixed', nextStatus: 'verified', evidence: {
      fixedAt,
      verificationMeasurement: { measurementType: 'verification', confirmsFixed: true, recordedAt: '2026-10-20T10:01:00.000Z' },
    },
  }).ok, true)
})
