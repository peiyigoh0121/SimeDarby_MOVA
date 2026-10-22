import assert from 'node:assert/strict'
import test from 'node:test'
import { parseIssueCoordinates, parseLatitude, parseLongitude } from './issueCoordinates.js'

test('rejects missing and blank coordinate values instead of coercing them to zero', () => {
  for (const value of [null, undefined, '', '   ']) {
    assert.equal(parseLatitude(value), null)
    assert.equal(parseLongitude(value), null)
  }
})

test('rejects non-numeric, non-finite, and out-of-range coordinates', () => {
  for (const value of ['north', true, false, {}, [], Number.NaN, Infinity, -Infinity]) {
    assert.equal(parseLatitude(value), null)
    assert.equal(parseLongitude(value), null)
  }
  assert.equal(parseLatitude(-90.0001), null)
  assert.equal(parseLatitude(90.0001), null)
  assert.equal(parseLongitude(-180.0001), null)
  assert.equal(parseLongitude(180.0001), null)
})

test('preserves valid numeric values and numeric strings at coordinate boundaries', () => {
  assert.deepEqual(parseIssueCoordinates('3.11806', '101.62083'), { lat: 3.11806, lng: 101.62083 })
  assert.deepEqual(parseIssueCoordinates(-90, 180), { lat: -90, lng: 180 })
  assert.deepEqual(parseIssueCoordinates(90, -180), { lat: 90, lng: -180 })
})
