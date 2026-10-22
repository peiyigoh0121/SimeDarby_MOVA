import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateConfidenceCount, evaluateMultiSignalEscalation } from './issueEvidence.js'

const reports = [
  { id: 'a', type: 'ramp', lat: 3.118, lng: 101.621, reporter: 'one', signal: 'photo' },
  { id: 'b', type: 'ramp', lat: 3.11805, lng: 101.621, reporter: 'two', signal: 'inspection' },
  { id: 'b', type: 'ramp', lat: 3.11805, lng: 101.621, reporter: 'three', signal: 'inspection' },
  { id: 'c', type: 'ramp', lat: 3.12, lng: 101.621, reporter: 'four', signal: 'photo' },
]

test('does not infer independent reports from row IDs', () => {
  assert.equal(evaluateConfidenceCount(reports[0], reports).state, 'insufficient_evidence')
})

test('counts each independent reporter once within the configured location threshold', () => {
  const result = evaluateConfidenceCount(reports[0], reports, {
    getIndependentReporterKey: (report) => report.reporter,
  })
  assert.equal(result.state, 'confirmed_report_count')
  assert.equal(result.reportCount, 2)
  assert.deepEqual(result.supportingReportIds, ['a', 'b'])
})

test('requires two distinct signal types before escalation', () => {
  const result = evaluateMultiSignalEscalation(reports[0], reports, {
    getIndependentReporterKey: (report) => report.reporter,
    getSignalType: (report) => report.signal,
  })
  assert.equal(result.state, 'escalated')
  assert.equal(result.supportingSignalCount, 2)
})
