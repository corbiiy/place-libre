property helperScheme : "placelibrehelper://scan/"

on run
  display dialog "Place Libre Helper est installé. Retournez sur Place Libre, ouvrez un plan Pathé puis cliquez sur « Analyser les meilleures places »." buttons {"OK"} default button "OK" with title "Place Libre Helper"
end run

on open location incomingURL
  if incomingURL does not start with helperScheme then return
  set encodedPayload to text ((length of helperScheme) + 1) thru -1 of incomingURL
  set remainder to (length of encodedPayload) mod 4
  if remainder is 2 then set encodedPayload to encodedPayload & "=="
  if remainder is 3 then set encodedPayload to encodedPayload & "="
  set normalizedPayload to do shell script "printf %s " & quoted form of encodedPayload & " | /usr/bin/tr '_-' '/+'"
  set bookingURL to do shell script "printf %s " & quoted form of normalizedPayload & " | /usr/bin/base64 -D"
  if bookingURL does not start with "https://s.pathe.fr/fr/" then return
  my scanPathe(bookingURL)
end open location

on scanPathe(bookingURL)
  set scanTab to missing value
  tell application "Safari"
    activate
    if not (exists front window) then return
    set placeLibreTab to current tab of front window
    set placeLibreURL to URL of placeLibreTab
    if placeLibreURL does not start with "https://place-libre-pathe-seats.cdilyas.chatgpt.site" and placeLibreURL does not start with "http://localhost:3000" then return
    try
      set scanTab to make new tab at end of tabs of front window with properties {URL:bookingURL}
      set current tab of front window to scanTab
      set seatCount to 0
      repeat 80 times
        delay 0.25
        try
          set seatCount to (do JavaScript "document.querySelectorAll('td[data-number][data-status]').length" in scanTab) as integer
        end try
        if seatCount > 0 then exit repeat
      end repeat
      if seatCount is 0 then error "seat-map-not-found"
      set scannerPath to POSIX path of (path to resource "scanner.js")
      set scannerSource to read POSIX file scannerPath as «class utf8»
      set scanJSON to do JavaScript scannerSource in scanTab
      close scanTab
      set current tab of front window to placeLibreTab
      do JavaScript "window.dispatchEvent(new CustomEvent('place-libre-seat-scan',{detail:" & scanJSON & "}));" in placeLibreTab
    on error
      try
        if scanTab is not missing value then close scanTab
      end try
      try
        set current tab of front window to placeLibreTab
        do JavaScript "window.dispatchEvent(new CustomEvent('place-libre-seat-scan-error',{detail:{type:'place-libre-seat-scan-error',error:'seat-map-not-found'}}));" in placeLibreTab
      end try
    end try
  end tell
end scanPathe
