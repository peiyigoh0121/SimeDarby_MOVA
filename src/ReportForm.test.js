import assert from 'node:assert/strict'
import test from 'node:test'
import { getResidentSubmissionError } from './lib/residentSubmissionValidation.js'

test('resident submission validation reports privacy and coordinate failures before saving', () => {
  assert.equal(
    getResidentSubmissionError({
      privacyAgreed: false,
      location: { lat: 3.11806, lng: 101.62083 },
    }),
    'Please agree to the privacy notice before submitting your report.',
  )

  assert.equal(
    getResidentSubmissionError({ privacyAgreed: true, location: { lat: 91, lng: 101.62083 } }),
    'Please provide a valid latitude and longitude before submitting your report.',
  )

  assert.equal(
    getResidentSubmissionError({ privacyAgreed: true, location: { lat: 3.11806, lng: 101.62083 } }),
    null,
  )
})
