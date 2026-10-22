import { parseIssueCoordinates } from './issueCoordinates.js'

export function getResidentSubmissionError({ privacyAgreed, location }) {
  if (!privacyAgreed) return 'Please agree to the privacy notice before submitting your report.'
  if (!parseIssueCoordinates(location?.lat, location?.lng)) {
    return 'Please provide a valid latitude and longitude before submitting your report.'
  }
  return null
}
