# Contributions

This file tracks the changes made in this fork of
[Particle Clicker](https://github.com/particle-clicker/particle-clicker)
(CERN Webfest 2014), compared with the original project's last commit
(`d6762d5`, March 2023). Add new work to the log at the bottom.

Repository: https://github.com/Inam72/particle-clicker-reloaded

---

## Summary

| Area | What changed |
| --- | --- |
| Multiplayer | Online peer-to-peer rooms plus a Windows classroom mode hosted on the teacher's local network. |
| Dark mode | Full dark theme with a toggle, remembers the choice, follows the OS setting by default. |
| Mobile | Portrait phones are now playable (stacked layout) instead of showing a "rotate your device" screen. |
| Saves | Export your save to a file and import it again on another device or browser. |
| Learning content | Info buttons on 28 upgrades explaining the physics; Research pages link to each other. |
| Visual progression | The detector changes colour as you unlock bigger colliders (SPS, Tevatron, LHC, LHCb). |
| Hosting | Runs on static hosts (Netlify config included); core JavaScript libraries are vendored locally, while Font Awesome icons load from a CDN. |
| Classroom | Windows launcher hosts the game and local multiplayer rooms on a classroom network; students join with a locally generated QR code. |
| Bug fixes | Upgrade purchases showed a positive funding change; auto-save restored; several smaller fixes. |

---

## Features

### Multiplayer (`js/multiplayer.js`, `index.html`, `js/app.js`)
- New **Multiplayer** menu. One player creates a room and shares a 6-character code; others join with it.
- The host picks the stat to compete on (reputation, data collected, funding collected or clicks) and an optional goal.
  - **With a goal:** a race. Only progress made *after joining the room* counts, so an existing save cannot win instantly. Finish times are shown.
  - **Without a goal:** a live leaderboard of each player's totals.
- Fully peer-to-peer over WebRTC using [Trystero](https://github.com/dmotz/trystero) (vendored, v0.25.4). Public Nostr relays handle the initial handshake only. Nothing to run, configure or pay for.
- Only name, stat, goal and progress are shared. Saves never leave the player's browser.
- If joining takes more than 20 seconds, a hint suggests checking the room code and that the host is still online.
- The optional Windows classroom launcher (`Start-Classroom.bat`, `Start-Classroom.ps1`, `ClassroomHost.cs`) hosts the game and room messages on the teacher's local network. Students can scan a locally generated QR code to join; no internet hosting or account is required.

### Windows classroom launcher
- Double-click `Start-Classroom.bat` to start the local host. Windows asks for permission to open access to the local network; the temporary firewall rule is removed when the host stops.
- The host runs for up to two hours. Teachers can stop it from the multiplayer dialog. Students join from the same Wi-Fi using the displayed QR code or room code.
- The launcher is Windows-only; online multiplayer remains available on other platforms and hosted copies.

### Dark mode (`css/style.css`, `index.html`, `js/app.js`, `js/detector.js`)
- Toggle in the navbar. The choice is saved; with no saved choice, the OS light/dark preference is used.
- Applied before the page draws, so there is no flash of the wrong theme on load.
- Covers the navbar, panels, modals, dropdowns, tabs, forms, tables and notices, and the detector canvas itself.

### Mobile / responsive layout (`css/style.css`, `js/ui.js`)
- Portrait phones previously got a full-screen "please rotate" message. The game now stacks the detector above the Research/HR/Upgrades tabs and scrolls naturally.
- Detector resizes to the screen width; larger tap targets on small screens; notices span the full width so they don't cover the tabs.

### Save export and import (`js/app.js`, `index.html`)
- **Saved** menu → **Export save** downloads `particle-clicker-save.json`.
- **Import save** loads such a file (after a confirmation). Files that aren't valid saves are rejected with a message.

### Physics explanations and cross-links (`json/upgrades.json`, `html/*.html`, `js/app.js`)
- Info (i) buttons on 28 upgrades: centre-of-mass energy, luminosity, and each collider (SPS, Tevatron, LHC, LHCb, ...).
- Research pages link to related topics (for example, the bottom quark page links to CP violation). Links to topics not yet discovered are greyed out with a "you haven't made this discovery yet" tooltip.

### Detector colour tiers (`js/detector.js`, `js/app.js`)
- Five palettes. The detector changes colour when the SPS, Tevatron, LHC and LHCb upgrades are bought, and the tier is restored on reload.

### Hosting and project setup
- jQuery, AngularJS and Bootstrap JS vendored under `js/external/` instead of loaded from old CDNs; protocol-relative URLs switched to `https://`.
- Font Awesome remains a CDN dependency for hosted copies; the Windows classroom launcher substitutes a local icon sheet for offline use.
- Removed the Google Analytics loader so classroom sessions are not sent to Google for tracking.
- `netlify.toml` for one-step Netlify deploys, including a content-type rule so the multiplayer module always loads.
- `README.md`: how to run locally and how multiplayer works. New `CONTRIBUTING.md` with the branch and pull-request workflow.
- Removed the expired "CERN 60 computing challenge" banner and the dead Google+ share link.

---

## Bug fixes

| Bug | Fix |
| --- | --- |
| Buying an upgrade showed **+cost** in the funding animation, as if money was gained. | Shows **-cost**, like hiring does. |
| Auto-save (every 10 s) was lost during the rework, so progress was only saved when "Save now" was clicked. | Restored. Also guarded so the timer can't write old progress back over a Restart or an Import. |
| Luminosity info showed the raw text `&sup9;` (invalid HTML entity) in the unit. | Unit now reads cm⁻² s⁻¹. |
| Multiplayer races compared lifetime totals, so any player with an existing save could win a race immediately. | Races count progress from when each player joined. |
| A wrong room code left the joiner on "waiting for room info..." forever with no feedback. | Hint shown after 20 s. |
| Any JSON file (e.g. `{}`) was accepted as a save on import. | Import now requires real save data. |

---

## Verification

Automated end-to-end run in headless Chrome against a local server: **31 of 31 checks passed**, covering:

- Page loads with no JavaScript errors and no missing files; icons render.
- Clicking the detector; auto-save within 10 s; Restart stays wiped.
- Dark mode on/off, persistence across reload, detector repaint.
- Upgrade info buttons and modal; luminosity unit; negative funding animation on purchase.
- Detector colour tier change and restore after reload.
- Research links (discovered navigates, undiscovered is greyed and inert).
- Export, import, and rejection of invalid and non-save files.
- Portrait and landscape phone layouts (no sideways scrolling).
- Multiplayer with two separate browsers over the real network: create, join (lower-case code with a trailing space), settings received, live progress, race finish order, existing save does not auto-win, leaving updates the board.

---

## Manual test checklist (before going live)

Run locally with `python -m http.server 8000` and open `http://localhost:8000`, or use the Netlify URL.

1. **Basics:** click the detector; Data goes up. Wait ~15 s, reload: progress is still there.
2. **Dark mode:** toggle it; reload; it stays. Toggle back.
3. **Upgrades:** play until upgrades appear (or import a later save); click an (i) button on an energy or luminosity upgrade and read it. Buy one: the funding animation shows a minus.
4. **Research links:** open the Beauty quark info at level 5+ and click "CP violation".
5. **Save file:** Saved → Export save. Click a few more times. Saved → Import save → pick the file → confirm: progress rolls back to the exported point.
6. **Phone:** open the site on a phone in portrait, then landscape. Everything should be reachable without sideways scrolling.
7. **Multiplayer (needs two devices, or two different browsers):**
   - Device A: Multiplayer → name → pick "Clicks", goal 20 → Create room. Note the code.
   - Device B: Multiplayer → name → enter code → Join room. Both names should appear within a few seconds.
   - Click on B until 20: B is marked "Finished in ..." on both screens.
   - Try a mobile-data connection for one side too; very strict networks may fail to connect (see limitations).
8. **Restart:** Saved → Restart → confirm. Wait 15 s, reload: the game is still fresh.

---

## Known limitations

- **Multiplayer needs everyone online at the same time.** Rooms exist only while at least one player has the page open.
- **Some networks can't connect peer-to-peer.** There is no TURN relay fallback (it would cost money to run), so a few strict corporate or mobile networks may fail to join.
- **Console warnings from public relays.** Some of Trystero's default Nostr relays are offline; the browser logs failed WebSocket connections. Harmless, since the working relays are used.
- **Race times are measured on each player's own clock** and are not tamper-proof. This is a friendly game, not a ranked one.
- **Scroll bars always visible** in the side panels on desktop (`overflow-y: scroll`). Cosmetic.
- The About box still links to the original CERN Webfest page, which no longer loads; kept as original credit text.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-09-06 | Initial import with bug fixes, responsive layout, dark mode, save export/import, upgrade info, research links, detector tiers, P2P multiplayer. |
| 2026-09-20 | Added `netlify.toml` for static deployment. |
| 2026-09-26 | Pre-launch review: restored auto-save, fixed luminosity unit, race progress counted from joining, slow-join hint, stricter save import, Netlify module header, removed dead Google+ link, this file. |
| 2026-10-04 | Renamed to Particle Clicker Reloaded: page title, navbar, About box, README and GitHub links now point to Inam72/particle-clicker-reloaded. Original CERN Webfest credits kept. |
