# Particle Clicker Reloaded

An addictive incremental game that teaches players the history of high energy particle physics.

An upgraded version of [Particle Clicker](https://github.com/particle-clicker/particle-clicker),
originally developed during the 2014 CERN Webfest over a weekend. This version
adds a phone-friendly layout, dark mode, physics explanations, save
export/import and peer-to-peer multiplayer (see [CONTRIBUTIONS.md](CONTRIBUTIONS.md)).

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
[Running locally](#running-locally) above. The game is playable
offline; only multiplayer needs an internet connection, and without
internet the small icons in the menus are not shown.

### Good to know for classrooms

- Each student's progress is saved in their own browser on their own
  device. The game does not use Google Analytics or upload save data.
  Multiplayer shares each player's name, selected stat, goal and current
  progress with peers; public Nostr relays help establish those connections.
- Students can move their progress between devices with
  **Saved → Export save** and **Import save**.
- For multiplayer, every player needs to be online at the same time.
  Some strict school networks block direct peer-to-peer connections; if
  students can't join a room, try a different network (for example a
  phone hotspot) or ask your IT team.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). A summary of the changes in this fork is in
[CONTRIBUTIONS.md](CONTRIBUTIONS.md).

## Multiplayer

Players can create or join a room to play against each other: either racing
to be the first to reach a target amount of a chosen stat (reputation, data
collected, funding collected, or clicks), or with no target set, just
comparing that stat on a live leaderboard.

There is no server and no account of any kind, on either end. Each player's
save stays in their own browser's local storage exactly as before; only
their name, chosen stat, goal, and current progress are ever sent to other
players, directly, peer-to-peer over WebRTC. Connections are set up with
[Trystero](https://github.com/dmotz/trystero) using its `nostr` strategy,
which uses public [Nostr](https://nostr.com/) relays to exchange the initial
connection handshake (`js/multiplayer.js`) — there is nothing to configure,
run, or pay for to make this work, on Netlify or any other static host.

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
