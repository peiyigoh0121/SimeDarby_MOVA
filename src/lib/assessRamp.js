// TODO: verify each limit against the Malaysian accessibility standard before presenting.
const MAX_SLOPE_DEGREES = 4.8
const SLOPE_WARNING_TOLERANCE_DEGREES = 1
const MIN_RAMP_WIDTH_M = 1.2
const SEVERITY_4_SLOPE_DEGREES = MAX_SLOPE_DEGREES + SLOPE_WARNING_TOLERANCE_DEGREES + 1
const VERY_STEEP_SLOPE_DEGREES = MAX_SLOPE_DEGREES + SLOPE_WARNING_TOLERANCE_DEGREES + 2

// Return a clear status and severity for the measurements supplied so far.
export function assessRamp(input = {}) {
  const { slopeDegrees, lengthM, widthM } = input || {}
  const reasons = []
  let result = 'pass'
  let severity = 1
  const hasSlope = Number.isFinite(slopeDegrees) && slopeDegrees >= 0
  const hasLength = Number.isFinite(lengthM) && lengthM > 0
  const hasWidth = Number.isFinite(widthM) && widthM > 0

  if (!hasSlope) reasons.push('Capture a valid slope angle to assess this ramp.')
  if (!hasLength) reasons.push('Enter a ramp length greater than zero metres.')
  if (!hasWidth) reasons.push('Enter a ramp width greater than zero metres.')

  // Missing measurements make the result a warning until the ramp can be checked.
  if (!hasSlope || !hasLength || !hasWidth) {
    result = 'warning'
    severity = 2
  }

  if (hasSlope && slopeDegrees > MAX_SLOPE_DEGREES) {
    reasons.push(`Slope is above the ${MAX_SLOPE_DEGREES}° placeholder limit.`)
    if (slopeDegrees <= MAX_SLOPE_DEGREES + SLOPE_WARNING_TOLERANCE_DEGREES) {
      result = result === 'fail' ? 'fail' : 'warning'
      severity = Math.max(severity, 2)
    } else {
      result = 'fail'
      severity = Math.max(
        severity,
        slopeDegrees >= VERY_STEEP_SLOPE_DEGREES
          ? 5
          : slopeDegrees >= SEVERITY_4_SLOPE_DEGREES ? 4 : 3,
      )
    }
  }

  if (hasWidth && widthM < MIN_RAMP_WIDTH_M) {
    reasons.push(`Ramp width is below the ${MIN_RAMP_WIDTH_M} m placeholder minimum.`)
    result = 'fail'
    severity = Math.max(severity, 3)
  }

  return { result, severity, reasons }
}
