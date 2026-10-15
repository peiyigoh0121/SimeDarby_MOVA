/* global process */

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_ISSUE_TYPES = new Set([
  'ramp',
  'blocked_tactile_paving',
  'broken_tactile_paving',
  'missing_handrail',
  'step_at_entrance',
  'lift_out_of_service',
  'drain_or_crossing',
  'pickup_point',
])
const MAX_BASE64_LENGTH = 4_000_000

function jsonResponse(body) {
  // Always return status 200 so the form can display a friendly error response.
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseModelJson(text) {
  // Remove optional Markdown fences before parsing the model's JSON response.
  const cleanedText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const result = JSON.parse(cleanedText)
  const validHandrail = ['present', 'absent', 'unclear'].includes(result?.handrail)
  const validSurface = ['rough', 'smooth', 'tiled', 'unclear'].includes(result?.surface)
  const validBlocked = result?.tactile_paving_blocked === true
    || result?.tactile_paving_blocked === false
    || result?.tactile_paving_blocked === null
  const validBroken = result?.tactile_paving_broken === true
    || result?.tactile_paving_broken === false
    || result?.tactile_paving_broken === null
  const validBlockedBy = result?.blocked_by === null || typeof result?.blocked_by === 'string'

  if (!result || typeof result !== 'object' || !validHandrail || !validSurface
    || !validBlocked || !validBroken || !validBlockedBy || typeof result.notes !== 'string') {
    throw new Error('The AI returned an answer in an unexpected format. Please enter the photo details manually.')
  }

  // Return only the fields the form expects and keep text short.
  return {
    handrail: result.handrail,
    surface: result.surface,
    tactile_paving_blocked: result.tactile_paving_blocked,
    blocked_by: result.blocked_by?.slice(0, 160) ?? null,
    tactile_paving_broken: result.tactile_paving_broken,
    notes: result.notes.slice(0, 300),
  }
}

export default {
  async fetch(request) {
    try {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'Send a photo check using POST.' })
      }

      const { imageBase64, mimeType, issueType } = await request.json()
      if (typeof imageBase64 !== 'string' || imageBase64.length === 0 || imageBase64.length > MAX_BASE64_LENGTH) {
        return jsonResponse({ error: 'The photo is missing or too large. Please choose a smaller photo.' })
      }
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
        return jsonResponse({ error: 'The photo data could not be read. Please choose the photo again.' })
      }
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return jsonResponse({ error: 'This photo format is not supported. Please use JPEG, PNG, WebP, or GIF.' })
      }
      if (!ALLOWED_ISSUE_TYPES.has(issueType)) {
        return jsonResponse({ error: 'Choose an issue type before checking the photo.' })
      }

      const apiKey = process.env.GEMINI_API_KEY
      const model = process.env.GEMINI_MODEL
      if (!apiKey || !model) {
        return jsonResponse({ error: 'Photo checking is not configured. Add GEMINI_API_KEY and GEMINI_MODEL on the server.' })
      }

      const prompt = `Look at this accessibility issue photo for the issue type "${issueType}". Only report details that are clearly visible. Use "unclear" or null when you cannot tell; do not guess. Do not identify people. Return ONLY one JSON object with exactly these fields and types: {"handrail":"present|absent|unclear","surface":"rough|smooth|tiled|unclear","tactile_paving_blocked":true|false|null,"blocked_by":"string or null","tactile_paving_broken":true|false|null,"notes":"short"}. For blocked_by, name the visible obstruction only when tactile paving is blocked, otherwise use null. Keep notes brief.`

      // Keep the API key in a server-only header, never in browser code or the URL.
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        },
      )

      if (!geminiResponse.ok) {
        return jsonResponse({ error: 'The AI photo check could not be completed. Please enter the details manually.' })
      }

      const geminiResult = await geminiResponse.json()
      const modelText = geminiResult.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
      if (!modelText) {
        return jsonResponse({ error: 'The AI could not read this photo. Please enter the details manually.' })
      }

      return jsonResponse(parseModelJson(modelText))
    } catch {
      return jsonResponse({ error: 'The AI photo check failed. Please enter the details manually.' })
    }
  },
}
