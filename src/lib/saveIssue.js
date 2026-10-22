import { createIssue } from './issueRepository.js'

export async function saveIssue(report) {
  try {
    const issue = await createIssue(report)
    return { ok: true, id: issue.id, issue }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error || 'Could not save the report.'),
    }
  }
}
