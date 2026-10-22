import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateFictionalMovaDemoData } from './demoDataValidation.js'

const seedFile = new URL('../../docs/demo-data/fictional-mova-ss2-seed.json', import.meta.url)
const dataset = JSON.parse(readFileSync(seedFile, 'utf8'))

test('fictional SS2 dataset is map-compatible and accepted by existing queues', () => {
  const result = validateFictionalMovaDemoData(dataset)
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.equal(result.recordCount, 8)
  assert.deepEqual(result.queueCounts, { maintenance: 7, enforcement: 1, unclassified: 0 })
})

test('validator rejects out-of-area coordinates and invalid record fields', () => {
  const invalid = structuredClone(dataset)
  invalid.records[0].movaRecord.lat = 0
  invalid.records[1].movaRecord.status = 'open'
  invalid.records[1].movaRecord.slope_deg = null
  const result = validateFictionalMovaDemoData(invalid)
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 3)
})
