import assert from 'node:assert/strict'
import test from 'node:test'
import { scoreIssuePriority, sortIssuesByPriority } from './issuePriority.js'

const now = new Date('2026-10-22T00:00:00.000Z')
const validInput = {
  severity: 5, pedestrianTraffic: 5, roadDanger: 5, createdAt: '2026-10-01T00:00:00.000Z', status: 'reported',
}

test('scores complete active inputs and treats fixed or verified records as resolved', () => {
  assert.equal(scoreIssuePriority(validInput, { now }).state, 'scored')
  assert.equal(scoreIssuePriority({ ...validInput, status: 'fixed' }, { now }).state, 'resolved')
  assert.equal(scoreIssuePriority({ ...validInput, status: 'verified' }, { now }).state, 'resolved')
})

test('marks missing, invalid, and future priority inputs as needing triage', () => {
  assert.match(scoreIssuePriority({ ...validInput, roadDanger: null }, { now }).missingFields.join(), /road danger/)
  assert.match(scoreIssuePriority({ ...validInput, pedestrianTraffic: 6 }, { now }).missingFields.join(), /pedestrian traffic/)
  assert.match(scoreIssuePriority({ ...validInput, createdAt: '2026-10-23T00:00:00.000Z' }, { now }).missingFields.join(), /reported date/)
})

test('sorts scored issues before triage and resolved issues', () => {
  const sorted = sortIssuesByPriority([
    { id: 'resolved', ...validInput, status: 'fixed', created_at: validInput.createdAt, priorityInputs: { pedestrianTraffic: 5, roadDanger: 5 } },
    { id: 'triage', ...validInput, severity: null, created_at: validInput.createdAt, priorityInputs: { pedestrianTraffic: 5, roadDanger: 5 } },
    { id: 'scored', ...validInput, created_at: validInput.createdAt, priorityInputs: { pedestrianTraffic: 5, roadDanger: 5 } },
  ], { now })
  assert.deepEqual(sorted.map((entry) => entry.issue.id), ['scored', 'triage', 'resolved'])
})
