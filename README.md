<div align="center">
  <img src="docs/logo.svg" width="112" height="112" alt="WRACKLINE" />
  <h1>WRACKLINE</h1>
  <p><strong>Survive the tide. Harvest the shore.</strong><br />
  A seaside arcade game about greed, timing, and thirteen waves of incoming water.</p>

  <p>
    <a href="https://wrackline.vercel.app"><img alt="Play WRACKLINE" src="https://img.shields.io/badge/PLAY-wrackline.vercel.app-1A85B6?style=for-the-badge&labelColor=17181C"></a>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/LICENSE-MIT-E7D3A4?style=for-the-badge&labelColor=17181C"></a>
    <a href="https://github.com/thesithunyein/wrackline/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/thesithunyein/wrackline?style=for-the-badge&labelColor=17181C&color=1A85B6"></a>
    <a href="https://github.com/thesithunyein/wrackline/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/thesithunyein/wrackline?style=for-the-badge&labelColor=17181C&color=F6C445"></a>
  </p>

  <p>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white&labelColor=17181C">
    <img alt="React 19" src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black&labelColor=17181C">
    <img alt="Three.js" src="https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white&labelColor=17181C">
    <img alt="Vite 8" src="https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white&labelColor=17181C">
    <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind_v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white&labelColor=17181C">
  </p>

  <p>
    <img alt="One serverless function" src="https://img.shields.io/badge/BACKEND-one_serverless_function-E25B45?style=for-the-badge&labelColor=17181C">
    <img alt="No art or audio files" src="https://img.shields.io/badge/ART_and_AUDIO-generated_at_runtime-767E88?style=for-the-badge&labelColor=17181C">
    <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-1A85B6?style=for-the-badge&labelColor=17181C"></a>
  </p>
</div>

![WRACKLINE title screen](public/og.png)

## Submission

| # | Item | Answer |
|---|---|---|
| 1 | **Game title** | **WRACKLINE** — *Survive the tide. Harvest the shore.* |
| 2 | **Team name** | Sithu Nyein (solo developer) |
| 3 | **Main contact** | Sithu Nyein — [sithunyein.mailto@gmail.com](mailto:sithunyein.mailto@gmail.com) |
| 4 | **Short description** | A seaside arcade game about greed and timing. You are a hermit crab working a storm beach: hold your nerve through the low tide, pull the wrack into your shell, and get off the sand before the breaker lands on you. Thirteen waves, four shell colours, a daily shore. |
| 16 | **Repository access** | Public: https://github.com/thesithunyein/wrackline. Submission tag **`v1.0.0`** (`git rev-parse v1.0.0` for the exact commit). |
| 17 | **Build version** | **1.0.0** — tag `v1.0.0`, deployed to production at https://wrackline.vercel.app on 2026-10-31. |

### 5. How to open and play

Open **https://wrackline.vercel.app** in a browser. There is nothing to install, no account and no
login: the title screen loads straight into the game. Press **PLAY**, scuttle with `A`/`D`, and hold
`Space` to haul. The first run takes about two minutes; `R` or `Enter` on the end screen starts the
next one.

### 6. Supported browsers

| Browser | Status |
|---|---|
| Chrome / Edge (Chromium 120+) | **Tested**, desktop and phone-sized viewports |
| Firefox 128+ | Smoke-tested during development; not a full gameplay pass |
| Safari 17+ (macOS / iOS) | Expected to work; **not tested** — no Apple hardware was available |

The game needs **WebGL2** and **Web Audio**. If WebGL is unavailable the canvas does not start, and
the shell portraits in the daily sheet fall back to flat colour swatches.

### 7. Supported devices

- **Desktop / laptop** with a keyboard and mouse — the intended way to play.
- **Phones** with touch — the same game, with on-screen arrows, HAUL and DIG buttons. Verified at
  390x844 (iPhone 14-class viewport) in Chromium; smaller widths are untested.
- **Tablets** — should work, untested.
- Hardware acceleration should be on; the renderer caps device pixel ratio at 1.5 on narrow frames
  and 1.75 on wide ones to protect the frame budget.

### 8. Controls and gameplay instructions

| Action | Keys | Touch |
|---|---|---|
| **Scuttle** | `A` / `D` or `←` / `→` | on-screen ◀ ▶ |
| **Haul** | Hold `Space`, or hold the mouse button | hold anywhere on the shore, or hold HAUL |
| **Bank** | Release `Space` / the pointer | release |
| **Dig in** | Hold `B` or `Shift` | hold DIG |
| **Pick the tide** | `1` / `2` / `3` on the title screen | tap CALM / SURF / STORM |
| **Pause** | `Esc` or `P` | tap pause |
| **Play again** | `R` or `Enter` on the end screen | PLAY AGAIN |
| **Sound on/off** | `M`, or gear → SOUND | gear → SOUND |
| **Fullscreen** | `F`, or gear → FULLSCREEN | desktop only |
| **Language** | gear → LANGUAGE (English / မြန်မာ) | same |
| **Tide boards** | trophy button | trophy button |
| **Guide** | `?` button | `?` button |

A run is **thirteen waves**. Walking is not the risk; holding is. The surge only takes a heart if it
catches you with loot on your back, so every wave is a bet on how long you dare hold. Releasing in
the last 0.45 seconds before the water lands pays a 1.5x **snuck bank** bonus. Hauling while the
surge is already on the shore pays 1.75x, because holding into the water is what costs you.

Between runs: **season** is the thirteen-wave run scored against everyone; **today's tide** is the
same shore and the same wrack placement for every player that day, with three missions, a streak,
and a daily board. Banking, missions and finished seasons earn shore points that unlock four shell
colours at 0 / 250 / 900 / 2400.

### 9. Known bugs and limitations

1. **Burmese medial ra (ြ, U+103C) can draw as a dotted box** in the Burmese UI. It reproduces with
   Noto Sans Myanmar, Aka08, Padauk and plain system fonts on the same Windows machine, and on live
   Burmese Wikipedia, so it is the platform's text shaper rather than these strings or this
   stylesheet. Not fixed; it may not appear on other machines.
2. **The leaderboard is self-reported.** The endpoint caps a score at what the game can physically
   pay out in the run time it claims, which stops a lazy `localStorage` edit but not a determined
   cheater. There is no login and no replay validation, and the README does not pretend otherwise.
3. **Fullscreen is unavailable on iOS Safari** (the API only covers video there). The settings row
   is disabled rather than lying about it.
4. **No offline mode.** After the app has loaded a run needs no network, but a reload with no
   connection fails: there is no service worker.
5. **`package.json` declares five libraries the game no longer imports** — `express`,
   `@google/genai`, `lucide-react`, `motion`, `dotenv`. Harmless at runtime (tree-shaken out of the
   bundle); trimming them is outstanding cleanup.
6. **The JavaScript bundle is 902 KB raw / 239 KB gzip**, almost all of it Three.js.
7. **Frame time measured in development was ~35 fps** (28 ms median) on the review machine in
   headful Chrome, below the 60 fps target; that machine is known to run slow, and real-device
   numbers are still wanted.

### 10. Third-party tools and libraries

| Library | Used for |
|---|---|
| **React 19** + **react-dom** | UI state, HUD, menus |
| **Three.js r186** | the entire 3D world: terrain, ocean, breaker, props, creature, particles |
| **Vite 8** + `@vitejs/plugin-react` | dev server and production build |
| **Tailwind CSS v4** + `@tailwindcss/vite` | HUD and menu styling |
| **TypeScript 7** (`tsc --noEmit`) | type checking; no emit |
| **tsx** + **Node's `node:test`** | the 36-test suite |
| **esbuild** | transitive build dependency |
| **Vercel** (host + serverless function + KV/Upstash Redis REST) | hosting, `/api/leaderboard`, durable board storage |

No game engine, physics library or audio library is used: the loop, the tide state machine, the
procedural audio graph and the share-card painter are written in this repository.

### 11. Asset credit summary

- **Art: none is licensed in.** Every mesh, the logo, the UI icons and the shell portraits are
  generated in code. The only binaries in the repository are `public/og.png`, rendered from the
  game's own scene, and `docs/logo.svg`, exported from the same mark.
- **Audio: no files.** All sound is synthesised at runtime through a Web Audio graph
  (`src/audio.ts`).
- **Fonts** are the only third-party assets fetched at runtime:
  - **Righteous** and **Space Grotesk** — SIL Open Font License, via Google Fonts.
  - **Noto Sans Myanmar** — SIL Open Font License, via Google Fonts (Burmese fallback).
  - **Aka08** by Moezed — the file carries an all-rights-reserved notice with no licence grant, so
    it is loaded from its author's published CDN
    (`cdn.jsdelivr.net/gh/saturngod/myanmar-unicode-fonts`) rather than copied into this repository.
    It is used only for the Burmese interface, and the stack falls through to Noto Sans Myanmar if
    it fails to load.

### 12. Special testing instructions

```bash
npm install --legacy-peer-deps   # npm's resolver trips over an esbuild peer range
npm run typecheck                # tsc --noEmit
npm test                         # 36 tests over leaderboard, retention, loot and i18n rules
npm run dev                      # http://localhost:3000
npm run build && npm run preview # production bundle
```

- **Judging the board without a database:** `npm run dev` (and any host without KV variables) has no
  `/api/leaderboard`. The client detects the failure, keeps the score on the device and labels the
  sheet "ON THIS DEVICE". That is the intended fallback, not a crash.
- **Daily content:** the day key is computed in **Myanmar time (UTC+06:30)** on the server, never
  sent by the client, so today's tide and board roll over at 18:30 UTC.
- **Viewports used for the last pass:** 1280x800 (desktop) and 390x844 (phone). Both were checked
  for header order, the settings sheet, language persistence across reload, and the shell portraits.
- **Suggested five-minute test:** play one SURF run to wave 4, release a haul inside the warning
  window to see **SNUCK IT**, get caught holding once to see a heart go, then open the trophy sheet
  and switch the language to မြန်မာ and back.

### 13. Recommended orientation, resolution and aspect ratio

- **Landscape, 16:9** is the intended presentation: 1280x720 or larger, up to 1440p.
- **Phones play in portrait** — the camera reframes for aspect ratios below 1.0 and the touch
  controls move to the bottom edge. Portrait is fully supported, not a fallback.
- Anything from **16:10 to roughly 4:3** is fine; the camera framing is applied from the aspect
  ratio at load and on resize.

### 14. Internet connection and external services

| Requirement | Needed for | If it is missing |
|---|---|---|
| The Vercel deployment itself | loading the game | nothing to play |
| **Google Fonts** (Righteous, Space Grotesk, Noto Sans Myanmar) | the typography | system font stack; the game still plays |
| **jsDelivr** (Aka08 TTF) | Burmese interface only, ~118 KB | Burmese falls back to Noto Sans Myanmar |
| **`/api/leaderboard`** on Vercel | world boards and score submission | the on-device board, labelled as such |
| **Upstash / Vercel KV (Redis REST)** | durable storage behind that endpoint | the endpoint answers `503` with `storage: "unavailable"` and the client keeps the local board |

A run itself makes **no network calls**: audio, art and the share card are generated locally, and
the score is posted once at the end.

### 15. AI tools used

| Tool | Purpose | Affected code or assets |
|---|---|---|
| **Qoder** (agentic coding IDE, Claude-based model) | implementation: scene code, game state, UI, i18n, settings sheet, tests, this README | most of `src/`, `api/leaderboard.ts`, `server/`, `tests/`, build config and docs. No art or audio assets were AI-generated — those are procedural code |
| **Chrome DevTools Protocol via puppeteer-core** (scripted locally, not shipped) | verification: header layout, language persistence, frame timing, font-paint checks | test-only scripts outside the repository |

Design direction, the feel of the game, every tuning constant and all review of the generated code
were done by the developer: the constants in `App.tsx` cite numbers measured from real playtests.
The Aka08 typeface was chosen by the developer, not by a tool.


## What this is

A seaside arcade game about tide timing and loot hauling. You are a hermit scuttler working a
storm beach: hold your nerve through the low tide, pull the wrack into your shell, and get off the
sand before the breaker lands on top of you.

Every wave gives you the same choice, and it is the whole game. The longer you hold, the more you
stand to bank, and the more the surge can tear off your back.

**Play it:** https://wrackline.vercel.app (a keyboard, a mouse or a thumb all work)

## Contents

- [Submission](#submission) — the submission checklist: title, team, contact, controls, browsers,
  devices, limitations, credits, AI use, version
- [How to play](#how-to-play)
- [Settings, sound and language](#settings-sound-and-language)
- [How it works](#how-it-works)
- [Running it locally](#running-it-locally)
- [Deployment](#deployment)
- [How it is built](#how-it-is-built)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## How to play

| Action | Keys | What it does |
|---|---|---|
| **Scuttle** | `A` / `D` or `←` / `→` | Walk the shore. Deeper sand holds richer wrack and a longer walk back. |
| **Haul** | Hold `Space`, or hold the screen | Everything within claw reach, about six units of beach either side of you, streams into your shell. Everything further out stays where it lies until you scuttle over to it, which is the whole reason the far, fatter pieces are worth more. The water counts as reach: hauling while the surge is on the shore pays **1.75x**. Keep holding and your shell swells, and a swollen shell is a wider target. |
| **Bank** | Release `Space` | The haul is stowed and safe. It counts immediately. |
| **Dig in** | Hold `B` or `Shift` | Burrow under the sand. The surge passes over you, and it takes everything you were holding. A 0.3 second wind-up makes it a commitment rather than a reflex. |
| **Pick the tide** | `1` / `2` / `3` on the title screen | Calm, Surf or Storm. |
| **Pause** | `Esc` or `P` | The tide holds while you are away; switching tabs pauses too. |
| **Share** | `SHARE` on the end screen | Saves a 1080x1350 PNG of the run: the mark, your name, and your best score. Asks for the name once, then remembers it. |

Walking is not the risk. Holding is. Releasing your haul the instant the water arrives is the
difference between a good wave and a lost one.

Holding into the water is its own gamble, and the game is built to reward it. While the surge is on
the shore the wrack floats, and the wave carries it: the breaker pushes it up the beach as it runs
in and drags it back out as it leaves. A piece you could not reach in the low tide can therefore be
lifted straight off the moving water for **1.75x** its worth, and the grab says `SURGE`. What it
costs is the old rule, unchanged: a surge that catches you holding takes a heart, and while it has
you the water claws pieces back off your back, about one and a half pieces a second. The bonus is
what that risk buys, not free money.

### Tides

| Tide | Multiplier | Low tide | Warning | Hearts | Character |
|---|---|---|---|---|---|
| CALM | 1.0× | 7.0s | 1.8s | 4 | Long low tide, slow breaker, forgiving window |
| SURF | 1.7× | 5.0s | 1.3s | 3 | The default. A fair fight between greed and escape |
| STORM | 2.8× | 3.6s | 0.9s | 2 | Short low tide, fast breaker, slower claws |

### The season

A run is **thirteen waves**. Survive all of them and you have outlasted the tide. Hearts are the
only losing condition, so water never ends a run by surprise, and the wrack line never kills you.
It just keeps eating the shore, which makes the closing waves thinner pickings.

| Waves | Stretch |
|---|---|
| 1 to 3 | SHALLOWS |
| 4 to 6 | THE WRACK |
| 7 to 9 | DEEP DRAW |
| 10 to 12 | BLACK TIDE |
| 13 | SEASON'S END |

The calm between surges shrinks all season rather than flattening out at wave seven, so wave
thirteen is genuinely the tightest wave in the run.

### Season, or today's tide

The menu starts either a season — the run above, scored against everyone's best — or **today's
tide**, which is the same shore with one modifier laid over it and the same wrack in the same
places for every player that day. The daily board is one board per day, so it compares runs played
under the same rules. Three missions sit on top, scored on your best run of the day, and a daily
tide a day keeps your streak alive. Banking, missions and surviving seasons earn shore points,
which unlock the four shell colours.

### Four moments the game is built around

- **The draw.** The low tide never shows you everything: roughly two in five pieces of a wave are
  still out on the water, and they wash in while the sea is already drawing back, one to three
  drops at a time. Every one of them lands at the waterline, where the surge arrives first and where
  a piece is worth the most. Without them the beach could be cleared and banked before the warning
  was even called, which made the whole greed decision optional.
- **The King Tide.** From wave three on, a wave can roll in as a King Tide and pay **double** on
  everything you bank during it. The odds climb as the run goes on, it never lands twice in a row,
  and three dry waves guarantee the next one rolls. It is the reason a cautious run still has a
  moment worth gambling on.
- **The snuck bank.** Release your haul inside the last 0.45 seconds of the warning, with the surge
  already moving, and the bank pays a **1.5× near miss bonus**, once per wave. Ten frames of
  slow motion mark it. This is the moment a run gets remembered for, and it only pays once per
  wave on purpose: if every bank paid the bonus, the greed decision would stop meaning anything.
- **The surge grab.** The water is the threat, and it is also the best larder on the beach. Haul
  while the surge is on the shore and the wave carries wrack to your claws for **1.75x**, so the
  pieces left stranded up at the waterline come to you instead of going back out with the tide.

Get caught holding loot and the surge claws it off your back, about one and a half pieces a second,
and you lose a heart. Lose the last one and the wave takes you.

## Settings, sound and language

The header carries three buttons, left to right: **tide boards** (trophy), **the guide** (`?`) and
**settings** (gear). Everything that used to sit loose in the header — the speaker and the
fullscreen toggle — lives inside the settings sheet now, next to the language switch.

| Setting | What it does | Also on a key |
|---|---|---|
| **Sound** | Waves, clicks and the shore. Off survives a reload. | `M` |
| **Language** | The whole shore, labels and guide: **English** or **မြန်မာ**. Survives a reload. | — |
| **Fullscreen** | Fills the screen. Hidden as disabled where the browser has no API for it, which includes iOS Safari. | `F` |

- **The language is the whole interface**, not a menu toggle: HUD, pause, guide, missions, end screen,
  boards, the name prompt and the share card all read through one dictionary
  (`src/game/i18n.ts`), with English as the key and English as the fallback.
- **Burmese gets its own type.** Righteous and Space Grotesk are Latin-only, so `html[lang='my']`
  swaps in **Aka08** (scoped to the Myanmar Unicode blocks so the wordmark stays Righteous), scales
  it 112% so the small labels stay legible, and pulls the game's wide signage tracking back down to
  0.01em, because that spacing breaks stacked Myanmar clusters apart into loose syllables.
- **The language label is never translated.** Someone looking for their own language has to be able
  to read it, so the Burmese option always says မြန်မာ, in Burmese, in both languages.
- **The shell row is the creature, not a colour chip.** Each of the four unlocks renders the same
  low-poly crab the shore uses, in that shell's colour, once per colour through a single throwaway
  renderer. Locked shells are drawn greyscale; the one you are wearing sits on the gold card.
- **Accessibility:** keyboard focus rings, `prefers-reduced-motion` honoured for the pulsing hints,
  safe-area insets on notched phones, and pinch-zoom is left enabled.

## How it works

Four views of the same machine, from the tide itself down to the code that draws it.

### The tide cycle

Every wave runs the same four phases. The breaker is a state machine, not a script.

```mermaid
flowchart LR
  A["LOW TIDE<br/>the sea is out and the wrack is yours"] --> B["WARNING<br/>the water draws back"]
  B --> C["WAVE SWEEP<br/>the breaker crosses the shore"]
  C --> D["WAVE RETREAT<br/>the sea pulls back out"]
  D --> A
```

### The decision

This is one wave from the player's side. Every arrow that says keep holding is a bet against the
next one.

```mermaid
flowchart TD
  Start["Low tide, loot in reach"] --> Hold["Hold HAUL"]
  Hold --> Swell["Wrack streams into your claws<br/>and your shell swells with it"]
  Swell --> Ask{"Is the surge about to land?"}
  Ask -->|"not yet, keep going"| Swell
  Ask -->|"release in time"| Bank["Bank it. The haul is safe."]
  Ask -->|"release in the last 0.45s"| Snuck["SNUCK IT<br/>the bank pays 1.5x"]
  Ask -->|"too late, still holding"| Tore["The surge claws loot off your back"]
  Ask -->|"hold on into the water"| Surge["SURGE GRAB<br/>the wave carries the wrack to you<br/>and every piece off moving water pays 1.75x"]
  Ask -->|"dig in instead"| Dig["You survive, and you lose the whole haul"]
  Tore --> Heart{"Hearts left?"}
  Surge --> Heart
  Heart -->|"yes"| Start
  Heart -->|"no"| Lost["The season ends here"]
  Bank --> Next["Next wave, and the fall in the wrack line is deeper"]
  Snuck --> Next
  Surge --> Next
  Dig --> Next
```

### A run

Thirteen waves, four named stretches, one ending you want.

```mermaid
flowchart LR
  W1["WAVE 1<br/>SHALLOWS"] --> W4["WAVE 4<br/>THE WRACK"]
  W4 --> W7["WAVE 7<br/>DEEP DRAW"]
  W7 --> W10["WAVE 10<br/>BLACK TIDE"]
  W10 --> W13["WAVE 13<br/>SEASON'S END"]
  W13 --> Win["You outlasted the tide"]
```

Later waves are tighter in three ways at once: the low tide window multiplies down as the run goes
on, the wrack line retreats eight units per surge so there is less to gather, and the King Tide odds
climb.

### Beyond one run

A run is the game. Around it sit four things that give a reason to start another one — today,
tomorrow, and for a shell colour that has to be earned.

```mermaid
flowchart TD
  Run["Finish a run"] --> Board["Tide boards<br/>season: best run per player<br/>today's tide: one board per day"]
  Run --> Missions["Daily missions<br/>three a day, scored on your best run"]
  Run --> Streak["Streak<br/>a daily tide a day keeps it alive"]
  Run --> Points["Shore points<br/>banked score + missions + seasons"]
  Points --> Shells["Shell colours<br/>four, unlocked at 0 / 250 / 900 / 2400"]
  Missions --> Tomorrow["Tomorrow's shore<br/>a new tide, new missions"]
  Streak --> Tomorrow
```

- **The daily tide is one shore for everyone.** A modifier is chosen from the Myanmar date
  (`RICH WRACK`, `THIN SHORE`, `LONG DRAW`, `KING SEASON`, `SHORT FUSE`) and the run's randomness is
  seeded from the same date, so the wrack lands in the same places for every player who plays it
  before the day turns at UTC+06:30. The board for that day is filed under a day key the *server*
  computes, never one the client sends.
- **Missions are per-run bests, not running totals.** "Bank 2,000 in a single tide" cannot be
  completed by two runs of 1,200, which is the point: they ask for a better run, not more runs.
- **A season run still counts toward missions; only a daily tide moves the streak.** The streak is
  a record of showing up on a day, and a season run does not prove that.
- **The on-device board always works.** The world board is used only when the endpoint reports
  durable storage; otherwise the board sheet says "on this device" and shows the run kept here.


### How the code fits together

```mermaid
flowchart TD
  Keys["Keyboard<br/>A D Space B"] --> App
  Pointer["Mouse and touch<br/>hold to haul"] --> App
  App["App.tsx<br/>game state, HUD, input, frame loop"] -->|"update state, drawdown"| Engine["game3d.ts<br/>terrain, ocean, breaker, scenery, creature, particles"]
  Engine -->|"draw"| Canvas["WebGL canvas"]
  App -->|"crunch, thock, rumble"| Audio["audio.ts<br/>a Web Audio graph built at runtime"]
  Audio --> Speakers["Sound"]
  App -->|"best score, name, daily progress"| Store["localStorage"]
  App -->|"rounded run"| Endpoint["api/leaderboard.ts<br/>Vercel function"]
  Endpoint -->|"durable only"| Vault["Redis REST<br/>Upstash / Vercel KV"]
  App -.->|"groundHeightAt x, z"| Engine
```

### Things worth knowing in the code

- **`src/game3d.ts` owns the scene.** Gameplay state lives in `App.tsx` and is pushed into the
  engine once per frame through `Wrackline3D.update()`.
- **`groundHeightAt( x, z )`** is the single source of truth for where the beach surface is.
  Scenery, loot and the player are all bedded onto it, so nothing floats or sinks as the slope
  changes across the shore.
- **The sea is calm where it meets the beach.** The swell is damped over the last fourteen units of
  shore, so the water surface is never below the sand it is meeting: the waterline is a line rather
  than a breathing band, and the draw bares beach instead of seabed.
- **The breaker is re-draped every frame.** `waterSurfaceY()` returns the waterline under the wave
  (the sand it is crossing, or sea level once the beach drops below it) and the swell, foam and
  shallow sheet are rebuilt on top of it. That is what keeps the surge attached to the sea instead
  of reading as a separate slab sliding over dry sand.
- **Greed is drawn, not just counted.** The shell visibly swells with the value riding on it, and
  that swell is read back as a hitbox, so a fat scuttler really is easier to catch than a lean one.
- **The share card is drawn, not screenshotted.** `src/shareCard.ts` paints a 1080x1350 PNG of the
  run on a canvas: the mark, the name, the record, and the season's result. The mark's shapes live
  in `src/logoMark.ts` so the card and the in-page logo cannot drift apart, and the whole thing is
  rasterised on the device, which is why there is no image endpoint and nothing to upload.
- **SHARE saves a file, and asks for a name only once.** The first press on a device with no name
  stored opens a prompt and keeps the answer in `localStorage`, so later presses save straight
  away; the picture lands in Downloads as `wrackline-<name>-<best>.png`. The save is an anchor
  download rather than `navigator.share` on purpose: handing the file to a share sheet gives it to
  another app, and a sheet that is dismissed or that never resolves has not saved anything.
- **Every ending has a cause.** A run ends because hearts ran out or because thirteen waves were
  survived, and the end screen names which one.
- **The frame budget is spent on pixels, not on bookkeeping.** Every material in the scene is
  `flatShading`, which derives its normals in the fragment shader, so the per-frame
  `computeVertexNormals()` calls on the non-indexed water meshes were pure waste and are gone. The
  renderer caps the device pixel ratio at 1.5 on a narrow frame and 1.75 on a wide one (a phone
  reporting 3 was drawing nine times the pixels it needed), the shadow atlas is 1024 on a phone and
  1536 on a desktop instead of 2048 everywhere, and the particle materials are shared rather than
  created per spray, dust or haul puff.

## Running it locally

```bash
npm install --legacy-peer-deps   # npm's resolver trips over an esbuild peer range
npm run dev                      # http://localhost:3000
npm run build                    # production bundle in dist/
npm run typecheck                # tsc --noEmit
npm test                         # node test runner over the board and retention rules
```

`--legacy-peer-deps` is only needed for a clean install; an existing `node_modules` is fine.

Vite serves the game but not `api/`: in `npm run dev` the board request answers 404 and the game
does exactly what it does on a host without storage — it keeps the score on the device and says so.

## Deployment

The game is a static bundle plus one serverless function, so any host with functions works. It is
currently on Vercel:

```bash
npm run build                              # check it locally first
vercel deploy --prod --project wrackline   # serves dist/ and api/leaderboard.ts
```

The world board needs durable storage, and is only enabled when the function can find it:

```bash
vercel env add KV_REST_API_URL production     # or UPSTASH_REDIS_REST_URL
vercel env add KV_REST_API_TOKEN production   # or UPSTASH_REDIS_REST_TOKEN
```

Without those two the endpoint answers `503` with `storage: 'unavailable'`, and the client keeps
the on-device board instead of pretending a server is holding the score. The function also reads
`LEADERBOARD_KV_REST_URL` / `LEADERBOARD_KV_REST_TOKEN`, so a dedicated database can be used
without colliding with another project's keys. The board's own keys are namespaced under
`wrackline:leaderboard:*`, and the daily board lives at `daily:<YYYY-MM-DD>` in Myanmar time.

## How it is built

- **React 19 + TypeScript + Vite 8**, with Tailwind CSS v4 for the HUD and menus.
- **Three.js** renders the whole world: a faceted dune mesh and wet sand strip, an animated ocean,
  the breaker, and every prop. Flat shading with non-indexed geometry keeps the low-poly facets.
- **Web Audio** synthesises all sound at runtime, from the gasp of the warning to the crunch of the
  wrack line. No audio files ship with the game.
- **No art files either.** Geometry, the logo and the UI icons are all generated, so the only binary
  in the repository is the social card.
- **Fonts are the only thing fetched at runtime**: Righteous and Space Grotesk for the Latin
  interface, Noto Sans Myanmar as the Burmese fallback, and Aka08 for the Burmese interface itself,
  which comes from its author's CDN because the file is all-rights-reserved.

## Project layout

```
index.html          shell, fonts, tab icon
src/main.tsx        entry
src/App.tsx         game state, HUD, input, the frame loop
src/game3d.ts       Three.js world: terrain, ocean, breaker, scenery, creature, particles
src/game/clock.ts   Myanmar day maths, shared with the endpoint
src/game/retention.ts  daily tide, missions, streak, shore points, shells
src/game/leaderboardCore.ts  the run rules every layer agrees on
src/game/leaderboard.ts      the client: local board, online board, submissions
src/game/loot.ts    how a wave's wrack splits between the sand and the draw
src/audio.ts        procedural Web Audio
src/Logo.tsx        the badge mark and wordmark
src/logoMark.ts     the mark's shapes, shared by the logo and the share card
src/shareCard.ts    the 1080x1350 score card, drawn on a canvas
src/index.css       the Tailwind entry, with the build output kept out of its scan
api/leaderboard.ts  GET/POST /api/leaderboard, season and daily boards
server/leaderboardStore.ts  file and Redis REST stores, one row per player
tests/              node:test suites for the board, retention and loot rules
docs/logo.svg       the mark on its own, for READMEs and press
public/og.png       social card
```

## Contributing

Bug reports, feel notes and pull requests are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) first: the short version is that greed is the timer, feel is the
product, and a change that makes holding less of a decision is probably not the change to make.

## Security

The game itself is still a client-side one with no accounts and no analytics, and
[SECURITY.md](SECURITY.md) says exactly what is worth reporting and what is known and accepted.
The one thing that leaves the browser is a score: when the world board is live, a finished run is
posted to `/api/leaderboard` with a device id, a run id, the score, the wave reached, the tide and
the run duration. There is no login, so a score is self-reported; the endpoint caps it at what the
game can physically pay out in the time it claims to have taken, and rejects anything that is not a
whole, positive number inside a season. That stops a lazy edit of `localStorage`, not a determined
cheater: a board of strangers' best runs cannot be cheat-proof without signed runs or replays, and
this one does not pretend to be.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md), version 2.1.

## License

[MIT](LICENSE). Copyright (c) 2026 Sithu Nyein.

## Credits

Built by **Sithu Nyein** ([sithunyein.mailto@gmail.com](mailto:sithunyein.mailto@gmail.com)).

**Art and audio:** entirely original and entirely procedural. The terrain, ocean, breaker, props,
creature, shell portraits, logo, UI icons and share card are drawn in code with Three.js and Canvas;
the sound is synthesised with Web Audio. No third-party art, models, textures or audio files are
used.

**Fonts** are the only third-party assets in the running game:

| Typeface | Role | Licence | Source |
|---|---|---|---|
| Righteous | wordmark and headings | SIL OFL 1.1 | Google Fonts |
| Space Grotesk | interface text, Latin | SIL OFL 1.1 | Google Fonts |
| Noto Sans Myanmar | Burmese fallback | SIL OFL 1.1 | Google Fonts |
| Aka08 (Moezed) | Burmese interface | All rights reserved; loaded from the author's CDN, not redistributed here | `saturngod/myanmar-unicode-fonts` on jsDelivr |

**Libraries:** React, Three.js, Vite and Tailwind CSS, all MIT licensed. The leaderboard function
runs on Vercel with Upstash/Vercel KV (Redis REST).
