# Particle Clicker Reloaded

An addictive incremental game that teaches players the history of high energy particle physics.

An upgraded version of [Particle Clicker](https://github.com/particle-clicker/particle-clicker),
originally developed during the 2014 CERN Webfest over a weekend. This version
adds a phone-friendly layout, dark mode, physics explanations, save
export/import, online multiplayer and an optional Windows classroom host
(see [CONTRIBUTIONS.md](CONTRIBUTIONS.md)).

The original game is at [http://cern.ch/particle-clicker](http://cern.ch/particle-clicker).

## Running locally

There's no build step — it's plain HTML/CSS/JS. Serve the folder with any
static file server and open it in a browser, e.g.:

```
python -m http.server 8000
```

then visit `http://localhost:8000`. Opening `index.html` directly from disk
(a `file://` URL) will not work, since the browser blocks the local JSON
data files from loading that way.

## Run a classroom game (Windows)

The teacher's computer can host the game and a multiplayer room on the
classroom Wi-Fi. Students need a browser, and no public hosting account is
required.

1. Download and unzip this repository.
2. Double-click `Start-Classroom.bat` and approve the Windows permission
   prompt. The game opens in your browser.
3. Open **Multiplayer**, enter your name, and choose **Create room and get a
   code**.
4. Students scan the on-screen QR code or open its link, enter a name, and
   join. Everyone must be on the same Wi-Fi network as the teacher's
   computer.
5. When finished, choose **Stop classroom and close Wi-Fi access**. The host
   also stops automatically after two hours and removes its temporary
   Windows Firewall rule.

The QR code is generated locally and contains the room code and private
classroom-network address; share it only with your class. Saved games stay
on each player's device. The classroom host shares only player names and
multiplayer scores over the local network. School Wi-Fi may prevent devices
from connecting to one another. The launcher currently supports Windows.
QR generation uses the bundled
[`qrcode-generator`](js/external/qrcode-generator-2.0.4.js), distributed
under the MIT license in
[`qrcode-generator-LICENSE.txt`](js/external/qrcode-generator-LICENSE.txt).

## Host it yourself (for schools and clubs)

You can put your own copy of the game online for free, so your students
can play it from a link on any computer or phone. There is nothing to
install, no database and no accounts: the game is a folder of plain web
files. Pick one of the options below.

### Option 1: GitHub Pages (free, about 5 minutes)

1. Create a free account at [github.com](https://github.com) if you don't
   have one.
2. Open this repository and click **Fork** (top right), then
   **Create fork**. You now have your own copy.
3. In your copy, go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to
   **Deploy from a branch**, choose the branch **main** and the folder
   **/ (root)**, then click **Save**.
5. Wait a minute or two and refresh the page. Your link appears at the
   top, in the form `https://<your-username>.github.io/particle-clicker-reloaded/`.
   Share that link with your students. Multiplayer also requires the
   `.mjs` file to be served as JavaScript (`text/javascript`); if the
   module fails to load, check the deployed file's `Content-Type` or use
   Netlify, which applies the included header rule.

### Option 2: Netlify (free)

1. Fork this repository as in Option 1, steps 1-2.
2. Create a free account at [netlify.com](https://www.netlify.com) and
   choose **Add new site → Import an existing project → GitHub**.
3. Pick your fork. Leave the **build command empty** and set the
   **publish directory** to `.` (the included `netlify.toml` already
   sets this).
4. Click **Deploy**. Netlify gives you a link you can share, and you can
   change its name in the site settings.

### Option 3: Your school's own web server

Download this repository (**Code → Download ZIP**), unzip it, and ask
your IT team to upload the whole folder to any web server as static
files. No server-side software is needed. One thing to tell them: files
ending in `.mjs` must be served as JavaScript (`text/javascript`),
otherwise multiplayer will not load. Most servers already do this.

### Without the internet

For a single classroom computer with no web hosting, use
the [Windows classroom launcher](#run-a-classroom-game-windows) above. The
game and its classroom multiplayer work without an internet connection.
When using another offline setup, the small icons in the menus are not
shown.

### Good to know for classrooms

- Each student's progress is saved in their own browser on their own
  device. The game does not use Google Analytics or upload save data.
  Online multiplayer shares each player's name, selected stat, goal and
  current progress with peers; public Nostr relays help establish those
  connections. Classroom mode sends those details only over the local Wi-Fi.
- Students can move their progress between devices with
  **Saved → Export save** and **Import save**.
- For online multiplayer, every player needs to be online at the same time.
  Some strict school networks block direct peer-to-peer connections; if
  students can't join an online room, try a different network or ask your
  IT team. For classroom mode, students must be on the teacher's Wi-Fi,
  which must allow devices to connect to each other.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). A summary of the changes in this fork is in
[CONTRIBUTIONS.md](CONTRIBUTIONS.md).

## Online multiplayer

Players on a website can create or join an online room to play against each
other: either racing to be the first to reach a target amount of a chosen
stat (reputation, data collected, funding collected, or clicks), or with no
target set, just comparing that stat on a live leaderboard.

Online rooms require no game server or account. Each player's save stays in
their own browser's local storage exactly as before; only their name, chosen
stat, goal, and current progress are sent to other players. Connections are
set up peer-to-peer over WebRTC with
[Trystero](https://github.com/dmotz/trystero)'s `nostr` strategy, which uses
public [Nostr](https://nostr.com/) relays to exchange the initial connection
handshake (`js/multiplayer.js`) — there is nothing to configure, run, or pay
for to make this work on Netlify or any other static host.

The Windows classroom launcher uses a temporary host on the teacher's
computer instead, and sends game-room messages only over the local Wi-Fi.

Because nothing is stored anywhere except in the browsers that are
currently playing, a room only exists for as long as at least one of its
players has it open — there's no way to check a room's leaderboard after
everyone has left, and a player who's behind a particularly restrictive
NAT/firewall may occasionally be unable to connect directly to peers (there
is no TURN relay server configured as a fallback, since that isn't free to
run).

The vendored `js/external/trystero-nostr-*.bundle.mjs` is Trystero's
`nostr` entry point (`trystero/nostr`, which re-exports
`@trystero-p2p/nostr`) fetched pre-bundled from
`https://esm.sh/trystero@<version>/nostr?bundle` — that's the version to
re-fetch from when upgrading it, rather than the plain npm package, since
Trystero is published as ES modules with dependencies that a browser can't
resolve on its own.
