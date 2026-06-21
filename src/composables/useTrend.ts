// Direction-of-travel helper for the dashboard gauges + depth readout.
//
// Every telemetry stream in the telemetry store is a newest-first ring buffer
// of { recordDatetime, value } samples, so the recent trend is just the sign of
// (latest - a-few-samples-ago). We look `back` samples into history (~1 s at the
// 5 Hz publish rate) rather than at the immediately previous sample so a single
// noisy tick doesn't flip the arrow, and apply a per-signal `eps` deadband so a
// value that's holding steady reads as 'flat' instead of jittering up/down.

export type Trend = 'up' | 'down' | 'flat'

export function trendOf(
  series: ReadonlyArray<{ value: number }> | undefined,
  opts: { back?: number; eps?: number } = {},
): Trend {
  if (!series || series.length < 2) return 'flat'
  const back = opts.back ?? 5
  const eps = opts.eps ?? 0
  const latest = series[0]?.value
  // Clamp to whatever history exists so a half-full buffer still reports.
  const prev = series[Math.min(back, series.length - 1)]?.value
  if (typeof latest !== 'number' || typeof prev !== 'number') return 'flat'
  const delta = latest - prev
  if (delta > eps) return 'up'
  if (delta < -eps) return 'down'
  return 'flat'
}
