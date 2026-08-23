JSON.stringify((() => {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const urlMatch = /^\/fr\/V([^/S]+)S(\d+)\/booking\/?$/i.exec(location.pathname);
  const freeHeading = Array.from(document.querySelectorAll("h1,h2,h3"))
    .map((element) => clean(element.textContent))
    .find((value) => /\d+\s+places?\s+libres?/i.test(value));
  const freeMatch = freeHeading && /(\d+)\s+places?\s+libres?/i.exec(freeHeading);
  const screenCandidates = Array.from(document.querySelectorAll("body *"))
    .filter((element) => /^écran$/i.test(clean(element.textContent)) && element.children.length === 0)
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  const screenY = screenCandidates.length
    ? screenCandidates.reduce((best, rect) => rect.width < best.width ? rect : best).top
    : null;
  const seats = Array.from(document.querySelectorAll("td[data-number]"))
    .filter((element) => Boolean(element.getAttribute("data-number")))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const label = element.getAttribute("data-number") || "";
      const labelMatch = /^(.*?)(\d+)$/.exec(label);
      const sectionElement = element.closest("[data-section]");
      const useElement = element.querySelector("use");
      const marker = useElement?.getAttribute("href") || useElement?.getAttribute("xlink:href") || "";
      const rawStatus = (element.getAttribute("data-status") || "").toLowerCase();
      const status = rawStatus === "available" || rawStatus === "free"
        ? "available"
        : rawStatus === "taken" || rawStatus === "occupied" || rawStatus === "unavailable"
          ? "taken"
          : rawStatus === "selected" || rawStatus === "mine" ? "selected" : "unknown";
      return {
        label,
        rowName: labelMatch?.[1] || "",
        seatName: labelMatch?.[2] || "",
        seatNumber: labelMatch?.[2] ? Number.parseInt(labelMatch[2], 10) : null,
        status,
        type: element.getAttribute("data-type") || "",
        typeCode: element.getAttribute("data-seattypecode") || "",
        section: element.getAttribute("data-section") || sectionElement?.getAttribute("data-section") || "",
        mapRow: element.parentElement?.rowIndex ?? -1,
        mapColumn: element.cellIndex,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        marker,
      };
    });
  return {
    type: "place-libre-seat-scan",
    helperVersion: "1.0.0",
    bookingUrl: location.href,
    cinemaIdentifier: urlMatch?.[1] || "",
    showingIdentifier: urlMatch?.[2] || "",
    displayedFreeCount: freeMatch?.[1] ? Number.parseInt(freeMatch[1], 10) : null,
    screenY,
    seats,
  };
})())
