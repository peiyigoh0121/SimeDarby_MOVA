function parseCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null

  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || number > maximum) return null
  return number
}

export function parseLatitude(value) {
  return parseCoordinate(value, -90, 90)
}

export function parseLongitude(value) {
  return parseCoordinate(value, -180, 180)
}

export function parseIssueCoordinates(lat, lng) {
  const parsedLat = parseLatitude(lat)
  const parsedLng = parseLongitude(lng)
  if (parsedLat === null || parsedLng === null) return null
  return { lat: parsedLat, lng: parsedLng }
}
