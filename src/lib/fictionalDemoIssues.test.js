import assert from 'node:assert/strict'
import test from 'node:test'
import { getFictionalDemoIssues } from './fictionalDemoIssues.js'

test('maps the validated fictional wrapper into local-only display issues', () => {
  const issues = getFictionalDemoIssues()
  assert.equal(issues.length, 8)
  assert.ok(issues.every((issue) => issue.isDemo === true))
  assert.ok(issues.every((issue) => issue.id.startsWith('demo-fictional-')))
  assert.ok(issues.every((issue) => Number.isFinite(issue.lat) && Number.isFinite(issue.lng)))
  assert.ok(issues.every((issue) => issue.priorityInputs.pedestrianTraffic >= 1))
})
