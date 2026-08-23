import assert from "node:assert/strict";
import test from "node:test";
import { analyseSeatScan, bookingIdentifiers, type LiveSeatRecord, type LiveSeatScan } from "../lib/seat-analysis";

function auditorium(): LiveSeatScan {
  const seats: LiveSeatRecord[] = [];
  for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
    const rowName = String.fromCharCode(65 + rowIndex);
    for (let seatIndex = 0; seatIndex < 15; seatIndex += 1) {
      const seatNumber = seatIndex + 6;
      seats.push({
        label: `${rowName}${seatNumber}`,
        rowName,
        seatName: String(seatNumber),
        seatNumber,
        status: "available",
        type: "Standard",
        typeCode: "STD",
        section: "main",
        mapRow: rowIndex,
        mapColumn: seatIndex,
        x: seatIndex * 20,
        y: rowIndex * 40,
        marker: "#seat-normal",
      });
    }
  }
  return {
    type: "place-libre-seat-scan",
    helperVersion: "test",
    bookingUrl: "https://s.pathe.fr/fr/V3132S118165/booking",
    cinemaIdentifier: "3132",
    showingIdentifier: "118165",
    displayedFreeCount: seats.length,
    screenY: 430,
    seats,
  };
}

test("extracts the Pathé identifiers from a booking link", () => {
  assert.deepEqual(bookingIdentifiers("https://s.pathe.fr/fr/V3132S118165/booking?pos=c2VhdGluZw%3D%3D"), {
    cinemaIdentifier: "3132",
    showingIdentifier: "118165",
  });
  assert.equal(bookingIdentifiers("https://example.com/fr/V3132S118165/booking"), null);
});

test("recommends the centered adjacent pair around 65 percent depth", () => {
  const result = analyseSeatScan(auditorium(), 2);
  assert.equal(result.recommendations[0]?.label, "D12–D13");
  assert.equal(result.availableStandardSeats, 135);
  assert.equal(result.countMatches, true);
});

test("excludes PMR seats and adapts to occupied seats", () => {
  const scan = auditorium();
  const pmr = scan.seats.find((seat) => seat.label === "D12")!;
  pmr.typeCode = "DIS";
  pmr.type = "PMR";
  pmr.marker = "#seat-pmr-normal";
  const occupied = scan.seats.find((seat) => seat.label === "D13")!;
  occupied.status = "taken";
  const result = analyseSeatScan(scan, 2);
  assert.notEqual(result.recommendations[0]?.label, "D12–D13");
  assert.equal(result.excludedAccessibleSeats, 1);
});

test("handles a loaded Pathé page without seat cells", () => {
  const scan = auditorium();
  scan.seats = [];
  scan.displayedFreeCount = 0;
  assert.deepEqual(analyseSeatScan(scan, 2), {
    recommendations: [],
    availableStandardSeats: 0,
    excludedAccessibleSeats: 0,
    countMatches: true,
  });
});
