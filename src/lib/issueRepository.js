import { getSupabaseClient, logSupabaseRequestError } from './supabaseClient.js'
import { parseIssueCoordinates, parseLatitude, parseLongitude } from './issueCoordinates.js'

const ISSUE_TABLE = 'MOVA'
const ISSUE_PHOTO_BUCKET = 'issue-photos'
const WRITABLE_ISSUE_FIELDS = new Set([
  'type',
  'lat_and_lng',
  'lat',
  'lng',
  'slope_deg',
  'photo_url',
  'status',
  'severity',
])

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function mapIssueRecord(record) {
  const lat = parseLatitude(record.lat)
  const lng = parseLongitude(record.lng)

  return {
    ...record,
    id: record.id,
    type: record.type || 'unknown',
    lat,
    lng,
    lat_and_lng: record.lat_and_lng ?? null,
    slope_degrees: toFiniteNumber(record.slope_deg),
    photo_url: record.photo_url || null,
    status: record.status || 'unknown',
    severity: toFiniteNumber(record.severity),
    location_name: lat !== null && lng !== null
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : 'Map coordinates unavailable',
    handrail: null,
    created_at: record.created_at ?? null,
  }
}

function pickWritableIssueFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([key, value]) => WRITABLE_ISSUE_FIELDS.has(key) && value !== undefined),
  )
}

async function uploadIssuePhoto(photoBlob) {
  if (!photoBlob) return null

  const supabase = getSupabaseClient()
  const randomPart = globalThis.crypto?.randomUUID?.()
    ?? Math.random().toString(36).slice(2)
  const photoPath = `${Date.now()}-${randomPart}.jpg`
  const { error } = await supabase.storage
    .from(ISSUE_PHOTO_BUCKET)
    .upload(photoPath, photoBlob, {
      contentType: photoBlob.type || 'image/jpeg',
      upsert: false,
    })

  if (error) {
    logSupabaseRequestError('photo upload', '/storage/v1/object/issue-photos/{path}', error)
    throw error
  }

  const { data } = supabase.storage.from(ISSUE_PHOTO_BUCKET).getPublicUrl(photoPath)
  return data.publicUrl
}

export async function fetchIssues() {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(ISSUE_TABLE)
    .select('id,type,lat_and_lng,lat,lng,slope_deg,photo_url,status,severity,created_at')

  if (error) {
    logSupabaseRequestError('issue fetch', '/rest/v1/MOVA', error)
    throw error
  }
  return (data || []).map(mapIssueRecord)
}

export async function createIssue(report) {
  const coordinates = parseIssueCoordinates(report.lat, report.lng)
  if (!coordinates) {
    throw new Error('A valid latitude and longitude are required to submit a report.')
  }
  const { lat, lng } = coordinates

  // Coordinate validation must complete before a photo upload or database write.
  const supabase = getSupabaseClient()
  const photoUrl = await uploadIssuePhoto(report.photoBlob)
  const issue = pickWritableIssueFields({
    type: report.type,
    lat,
    lng,
    slope_deg: report.slope_degrees,
    photo_url: photoUrl,
    status: 'reported',
    severity: String(report.severity),
  })
  const { data, error } = await supabase
    .from(ISSUE_TABLE)
    .insert(issue)
    .select('*')
    .single()

  if (error) {
    logSupabaseRequestError('issue insert', '/rest/v1/MOVA', error)
    throw error
  }
  return mapIssueRecord(data)
}

export async function updateIssue(issueId, changes) {
  if (Object.hasOwn(changes, 'status')) {
    throw new Error('Status changes are unavailable until the approved workflow and database permissions are in place.')
  }

  const update = pickWritableIssueFields(changes)
  if (!issueId) throw new Error('An issue id is required to update an issue.')
  if (Object.keys(update).length === 0) {
    throw new Error('No supported issue fields were supplied for update.')
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from(ISSUE_TABLE)
    .update(update)
    .eq('id', issueId)
    .select('*')
    .single()

  if (error) {
    logSupabaseRequestError('issue update', '/rest/v1/MOVA', error)
    throw error
  }
  return mapIssueRecord(data)
}

export function subscribeToIssues(onChange, onError) {
  const supabase = getSupabaseClient()
  const channel = supabase
    .channel('issues-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: ISSUE_TABLE }, onChange)
    .subscribe((status) => {
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && onError) {
        const error = new Error('Live issue updates are unavailable. Refresh to fetch the latest issues.')
        logSupabaseRequestError('issue subscription', '/realtime/v1', error)
        onError(error)
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}
