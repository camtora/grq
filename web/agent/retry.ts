/**
 * Outcome-independent attempt throttle (D123, 2026-09-11).
 *
 * The Bull Race and Options Desk decide "due" from their OUTPUT (a RaceCall/DeskCall row this hour /
 * today). A run whose entrants all fail writes nothing, so it is due again on the very next 60s tick —
 * that is the retry storm behind the 4-failures-a-minute push flood. Gate on the ATTEMPT instead: a
 * race/desk is tried at most once per gap regardless of how the try went. In-memory on purpose — a
 * restart resets it, which is bounded and fine.
 */
export const ATTEMPT_GAP_MS = 55 * 60_000; // the hourly cadence's own spacing

/** True (and records the attempt) if `id` has not been attempted within `gapMs`. Pure given the map. */
export function attemptGate(seen: Map<number, number>, id: number, nowMs: number, gapMs = ATTEMPT_GAP_MS): boolean {
  const last = seen.get(id);
  if (last !== undefined && nowMs - last < gapMs) return false;
  seen.set(id, nowMs);
  return true;
}
