export type LiveSeatStatus = "available" | "taken" | "selected" | "unknown";

export type LiveSeatRecord = {
  label: string;
  rowName: string;
  seatName: string;
  seatNumber: number | null;
  status: LiveSeatStatus;
  type: string;
  typeCode: string;
  section: string;
  mapRow: number;
  mapColumn: number;
  x: number;
  y: number;
  marker: string;
};

export type LiveSeatScan = {
  type: "place-libre-seat-scan";
  helperVersion: string;
  bookingUrl: string;
  cinemaIdentifier: string;
  showingIdentifier: string;
  displayedFreeCount: number | null;
  screenY: number | null;
  seats: LiveSeatRecord[];
};

export type RecommendedSeatBlock = {
  label: string;
  labels: string[];
  rowName: string;
  seatType: string;
  score: number;
};

export type SeatAnalysis = {
  recommendations: RecommendedSeatBlock[];
  availableStandardSeats: number;
  excludedAccessibleSeats: number;
  countMatches: boolean | null;
};

const accessiblePattern = /(?:^|\b)(DIS|PMR|PFR|WHEEL|COMP|ACCOMP)|pmr|fauteuil\s*roulant|wheelchair|accompagnant/i;

export function bookingIdentifiers(bookingUrl: string): { cinemaIdentifier: string; showingIdentifier: string } | null {
  try {
    const url = new URL(bookingUrl);
    if (url.hostname !== "s.pathe.fr") return null;
    const match = /^\/fr\/V([^/S]+)S(\d+)\/booking\/?$/i.exec(url.pathname);
    return match?.[1] && match[2] ? { cinemaIdentifier: match[1], showingIdentifier: match[2] } : null;
  } catch {
    return null;
  }
}

export function isAccessibleSeat(seat: LiveSeatRecord): boolean {
  return accessiblePattern.test(`${seat.typeCode} ${seat.type} ${seat.marker}`);
}

function sameSeatType(left: LiveSeatRecord, right: LiveSeatRecord): boolean {
  return left.typeCode === right.typeCode && left.type === right.type;
}

function sameSection(left: LiveSeatRecord, right: LiveSeatRecord): boolean {
  return left.section === right.section || (!left.section && !right.section);
}

function areNeighbours(left: LiveSeatRecord, right: LiveSeatRecord): boolean {
  if (left.mapRow !== right.mapRow || right.mapColumn - left.mapColumn !== 1) return false;
  if (left.rowName !== right.rowName || !sameSeatType(left, right) || !sameSection(left, right)) return false;
  if (left.seatNumber === null || right.seatNumber === null) return false;
  return Math.abs(right.seatNumber - left.seatNumber) === 1;
}

function rowDepths(seats: LiveSeatRecord[], screenY: number | null): Map<number, number> {
  const rows = [...new Set(seats.map((seat) => seat.mapRow))];
  const rowY = new Map(rows.map((row) => {
    const values = seats.filter((seat) => seat.mapRow === row).map((seat) => seat.y).filter(Number.isFinite);
    return [row, values.length ? values.reduce((total, value) => total + value, 0) / values.length : row] as const;
  }));
  const ordered = [...rows].sort((left, right) => {
    if (screenY !== null) return Math.abs((rowY.get(left) ?? left) - screenY) - Math.abs((rowY.get(right) ?? right) - screenY);
    return right - left;
  });
  return new Map(ordered.map((row, index) => [row, ordered.length <= 1 ? 0.65 : index / (ordered.length - 1)]));
}

function blockScore(block: LiveSeatRecord[], depthByRow: Map<number, number>, centerX: number, halfWidth: number): number {
  const blockX = block.reduce((total, seat) => total + seat.x, 0) / block.length;
  const centerDistance = Math.min(1, Math.abs(blockX - centerX) / Math.max(halfWidth, 1));
  const depth = depthByRow.get(block[0]?.mapRow ?? -1) ?? 0.5;
  const depthDistance = Math.min(1, Math.abs(depth - 0.65) / 0.65);
  return depthDistance * 0.58 + centerDistance * 0.42;
}

export function analyseSeatScan(scan: LiveSeatScan, partySize = 2): SeatAnalysis {
  const safePartySize = Math.max(1, Math.min(4, Math.round(partySize)));
  if (!scan.seats.length) {
    return {
      recommendations: [],
      availableStandardSeats: 0,
      excludedAccessibleSeats: 0,
      countMatches: scan.displayedFreeCount === null ? null : scan.displayedFreeCount === 0,
    };
  }
  const freeSeats = scan.seats.filter((seat) => seat.status === "available");
  const standardSeats = freeSeats.filter((seat) => !isAccessibleSeat(seat));
  const depthByRow = rowDepths(scan.seats, scan.screenY);
  const xValues = scan.seats.map((seat) => seat.x).filter(Number.isFinite);
  const minX = xValues.length ? Math.min(...xValues) : Math.min(...scan.seats.map((seat) => seat.mapColumn));
  const maxX = xValues.length ? Math.max(...xValues) : Math.max(...scan.seats.map((seat) => seat.mapColumn));
  const centerX = (minX + maxX) / 2;
  const halfWidth = Math.max((maxX - minX) / 2, 1);
  const ordered = [...standardSeats].sort((left, right) => left.mapRow - right.mapRow || left.mapColumn - right.mapColumn);
  const candidates: RecommendedSeatBlock[] = [];

  for (let index = 0; index <= ordered.length - safePartySize; index += 1) {
    const block = ordered.slice(index, index + safePartySize);
    if (block.length !== safePartySize) continue;
    if (block.slice(0, -1).some((seat, offset) => !areNeighbours(seat, block[offset + 1]!))) continue;
    const labels = [...block].sort((left, right) => (left.seatNumber ?? 0) - (right.seatNumber ?? 0)).map((seat) => seat.label);
    candidates.push({
      label: labels.join("–"),
      labels,
      rowName: block[0]?.rowName ?? "",
      seatType: block[0]?.typeCode || block[0]?.type || "standard",
      score: blockScore(block, depthByRow, centerX, halfWidth),
    });
  }

  const parsedFreeCount = freeSeats.length;
  return {
    recommendations: candidates.sort((left, right) => left.score - right.score).slice(0, 3),
    availableStandardSeats: standardSeats.length,
    excludedAccessibleSeats: parsedFreeCount - standardSeats.length,
    countMatches: scan.displayedFreeCount === null ? null : scan.displayedFreeCount === parsedFreeCount,
  };
}

export function isLiveSeatScan(value: unknown): value is LiveSeatScan {
  if (!value || typeof value !== "object") return false;
  const scan = value as Partial<LiveSeatScan>;
  return scan.type === "place-libre-seat-scan"
    && typeof scan.showingIdentifier === "string"
    && typeof scan.cinemaIdentifier === "string"
    && Array.isArray(scan.seats)
    && scan.seats.every((seat) => seat && typeof seat.label === "string" && typeof seat.status === "string");
}
