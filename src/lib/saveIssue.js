import { getSupabaseClient } from './supabaseClient.js'

export async function saveIssue(report) {
  try {
    const supabase = getSupabaseClient()
    let photoUrl = null

    if (report.photoBlob) {
      const randomPart = globalThis.crypto?.randomUUID?.()
        ?? Math.random().toString(36).slice(2)
      const photoPath = `${Date.now()}-${randomPart}.jpg`

      const { error: uploadError } = await supabase.storage
        .from('issue-photos')
        .upload(photoPath, report.photoBlob, {
          contentType: report.photoBlob.type || 'image/jpeg',
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('issue-photos')
        .getPublicUrl(photoPath)
      photoUrl = publicUrlData.publicUrl
    }

    const { data, error: insertError } = await supabase
      .from('issues')
      .insert({
        type: report.type,
        lat: report.lat,
        lng: report.lng,
        slope_degrees: report.slope_degrees,
        photo_url: photoUrl,
        status: 'reported',
        severity: report.severity,
      })
      .select('id')
      .single()

    if (insertError) throw insertError
    return { ok: true, id: data.id }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error || 'Could not save the report.'),
    }
  }
}
