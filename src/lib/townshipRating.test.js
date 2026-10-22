import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateTownshipAccessibilityRating } from './townshipRating.js'

function issue(id, status = 'verified', severity = 5, extra = {}) {
  return {
    id: String(id), type: 'blocked_tactile_paving', lat: 3.118, lng: 101.621,
    status, severity, created_at: '2026-01-01T00:00:00.000Z', ...extra,
  }
}

test('returns insufficient data for empty issue data', () => {
  assert.equal(calculateTownshipAccessibilityRating([]).state, 'insufficient_data')
})

test('does not treat a missing ramp measurement as complete coverage', () => {
  const issues = Array.from({ length: 10 }, (_, index) => issue(index, 'verified', 5, { type: 'ramp', slope_degrees: null }))
  const result = calculateTownshipAccessibilityRating(issues)
  assert.equal(result.state, 'insufficient_data')
  assert.equal(result.completeRecords, 0)
})

test('unresolved issues reduce the score, including fixed-but-unverified records', () => {
  const issues = [...Array.from({ length: 8 }, (_, index) => issue(index)), issue(8, 'fixed'), issue(9, 'reported')]
  const result = calculateTownshipAccessibilityRating(issues)
  assert.equal(result.score, 80)
  assert.equal(result.badge, 'silver')
})

test('awards gold, silver, and bronze only at their thresholds', () => {
  const gold = calculateTownshipAccessibilityRating(Array.from({ length: 10 }, (_, index) => issue(index)))
  const silver = calculateTownshipAccessibilityRating([
    ...Array.from({ length: 8 }, (_, index) => issue(index)), issue(8, 'reported'), issue(9, 'reported'),
  ])
  const bronze = calculateTownshipAccessibilityRating([
    ...Array.from({ length: 6 }, (_, index) => issue(index)),
    ...Array.from({ length: 4 }, (_, index) => issue(index + 6, 'assigned')),
  ])
  assert.deepEqual([gold.badge, silver.badge, bronze.badge], ['gold', 'silver', 'bronze'])
  assert.deepEqual([gold.score, silver.score, bronze.score], [100, 80, 60])
})
