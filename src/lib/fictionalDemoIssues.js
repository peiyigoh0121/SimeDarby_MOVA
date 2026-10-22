import fictionalDataset from '../../docs/demo-data/fictional-mova-ss2-seed.json' with { type: 'json' }
import { validateFictionalMovaDemoData } from './demoDataValidation.js'

function toDemoIssue(entry, index) {
  const record = entry.movaRecord
  return {
    ...record,
    id: `demo-fictional-${index + 1}`,
    slope_degrees: record.slope_deg,
    location_name: `${record.lat.toFixed(5)}, ${record.lng.toFixed(5)} (fictional demo)`,
    handrail: null,
    priorityInputs: { ...entry.demoPriorityInputs },
    fictionalScenario: entry.fictionalScenario,
    isDemo: true,
  }
}

/** Returns local-only display data. It never reads from or writes to Supabase. */
export function getFictionalDemoIssues() {
  const validation = validateFictionalMovaDemoData(fictionalDataset)
  if (!validation.ok) throw new Error(`Fictional demo data is invalid: ${validation.errors.join(' ')}`)
  return fictionalDataset.records.map(toDemoIssue)
}
