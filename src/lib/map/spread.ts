/**
 * Spreading markers that land on the same point of the screen.
 *
 * WHY THIS EXISTS. Past MAP_CLUSTER.maxZoom every pin stands on its own, and
 * two approved places at the same coordinate — the duplicate the queue could
 * not merge until 0039, or two genuinely distinct places in one building —
 * draw their 44px markers on top of each other. The one underneath cannot be
 * seen or clicked. Clustering does not help: it has already stopped.
 *
 * WHAT IT DOES. Markers whose screen positions sit within `thresholdPx` of
 * each other are grouped, and each member of a group is pushed out onto a
 * small ring around the group's centre, evenly spaced, starting at twelve
 * o'clock. A marker on its own stays exactly where its coordinate is. The
 * offsets are screen pixels, so they are recomputed whenever the zoom settles
 * — at the next zoom level the two may be far enough apart to stand alone.
 *
 * WHAT IT DOES NOT DO. It does not move a place. The marker is drawn a few
 * pixels from the coordinate; the coordinate itself, the card and the page are
 * untouched, which is why the ring is small — close enough that the marker is
 * still read as "there", apart enough that both can be seen and clicked.
 *
 * Pure, so it can be checked without a map: positions in, offsets out, in the
 * same order.
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export const MARKER_SPREAD = {
  /** Two markers closer than this, centre to centre, are drawn as a group. */
  thresholdPx: 40,
  /** How far each member of a group is pushed from the group's centre. */
  radiusPx: 30,
} as const;

/**
 * One offset per point, `[dx, dy]` in screen pixels. `[0, 0]` for a point
 * that stands alone. Groups are found by single linkage — a chain of points
 * each within the threshold of the next is one group — which is the reading
 * that never leaves two overlapping markers in different groups.
 */
export function spreadOffsets(
  points: readonly ScreenPoint[],
  options: { thresholdPx?: number; radiusPx?: number } = {},
): Array<[number, number]> {
  const threshold = options.thresholdPx ?? MARKER_SPREAD.thresholdPx;
  const radius = options.radiusPx ?? MARKER_SPREAD.radiusPx;
  const n = points.length;
  const offsets: Array<[number, number]> = points.map(() => [0, 0]);
  if (n < 2) return offsets;

  // Union–find over the pairs within the threshold. n is at most the map's
  // pin limit, so the quadratic pass is cheap and plain.
  const parent = points.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] ?? root;
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor] ?? root;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  for (let a = 0; a < n; a += 1) {
    const pa = points[a];
    if (!pa) continue;
    for (let b = a + 1; b < n; b += 1) {
      const pb = points[b];
      if (!pb) continue;
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < threshold) parent[find(a)] = find(b);
    }
  }

  const groups = new Map<number, number[]>();
  for (let index = 0; index < n; index += 1) {
    const root = find(index);
    const members = groups.get(root) ?? [];
    members.push(index);
    groups.set(root, members);
  }

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // Around the group's centre rather than around each coordinate, so a pair
    // at the same point is pushed symmetrically apart instead of both to one
    // side; members keep their input order round the ring, so a marker does
    // not swap places with its neighbour between two syncs.
    let cx = 0;
    let cy = 0;
    for (const index of members) {
      cx += points[index]?.x ?? 0;
      cy += points[index]?.y ?? 0;
    }
    cx /= members.length;
    cy /= members.length;
    members.forEach((index, position) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * position) / members.length;
      const point = points[index];
      if (!point) return;
      // The offset is relative to the marker's own coordinate: aim it at the
      // ring position around the centre.
      offsets[index] = [
        Math.round(cx + radius * Math.cos(angle) - point.x),
        Math.round(cy + radius * Math.sin(angle) - point.y),
      ];
    });
  }

  return offsets;
}
