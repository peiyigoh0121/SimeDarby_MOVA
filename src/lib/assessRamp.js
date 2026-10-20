export function assessRamp({ slopeDegrees, lengthM, widthM }) {
  if (slopeDegrees === null || !Number.isFinite(slopeDegrees)) {
    return {
      result: 'warning',
      severity: 3,
      reasons: ['No slope measurement recorded.'],
    };
  }

  const reasons = [];
  let result = 'pass';
  let severity = 1;

  // Malaysian MS 1184 Standard: 1:12 slope is 4.76 degrees
  if (slopeDegrees > 7.13) {
    result = 'fail';
    severity = 5;
    reasons.push(`Slope is ${slopeDegrees.toFixed(1)}° (steeper than 1:8). Serious roll-over hazard for independent wheelchair users.`);
  } else if (slopeDegrees > 4.76) {
    result = 'warning';
    severity = 3;
    reasons.push(`Slope is ${slopeDegrees.toFixed(1)}° (between 1:12 and 1:8). Exceeds MS 1184 maximum of 4.76° (1:12) for independent transit.`);
  } else {
    reasons.push(`Slope is ${slopeDegrees.toFixed(1)}° (1:12 or gentler), compliant with MS 1184 standard.`);
  }

  if (lengthM !== null && lengthM !== undefined && Number.isFinite(lengthM)) {
    if (lengthM > 6.0) {
      reasons.push(`Ramp length is ${lengthM.toFixed(1)}m. Intermediate rest landing required every 6m under MS 1184.`);
      if (result === 'pass') result = 'warning';
      severity = Math.max(severity, 3);
    }
  }

  if (widthM !== null && widthM !== undefined && Number.isFinite(widthM)) {
    if (widthM < 1.2) {
      reasons.push(`Clear width is ${widthM.toFixed(2)}m (below MS 1184 minimum 1.20m requirement).`);
      if (result === 'pass') result = 'warning';
      severity = Math.max(severity, 3);
    }
  }

  return { result, severity, reasons };
}