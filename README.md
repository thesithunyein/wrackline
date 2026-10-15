# WRACKLINE

A seaside arcade game about tide timing and loot hauling. You are a hermit scuttler working a
storm beach: hold your nerve through the low tide, drag the wrack back to your shell, and get off
the sand before the breaker lands on top of you.

**Play it:** https://wrackline.vercel.app

---

## The loop

Every cycle runs **low tide → warning → wave → retreat**, and each wave pushes the wrack line
eighteen units further up the beach. Survive the wave and you keep what you hauled; get caught
holding too much and the surge tears loot off your back, piece by piece.

| | |
|---|---|
| **Scuttle** | `A` / `D` (or `←` / `→`) — walk the shore. Deeper sand holds richer loot and a longer walk back. |
| **Haul** | Hold `Space` — everything within reach streams into your shell. Keep holding; the longer you hold, the more you stand to lose. |
| **Bank** | Release `Space` — the haul is banked and safe. |
| **Flee** | When the warning banner fires, get clear or lose the load. |

Holding is the whole decision: every second of greed is another piece of wrack the wave can rip
back off you.

### Tides

| Tide | Multiplier | Behaviour |
|---|---|---|
| CALM | 1.0× | Long low tide, slow breaker, forgiving warning |
| SURF | 1.7× | The default. Balanced window between greed and escape |
| STORM | 2.8× | Short low tide, fast breaker, tighter haul reach |

Later waves shorten the low tide further, so the game tightens on its own. A **King Tide** rolls in
on some waves and doubles everything you bank during it.

## Running it locally

```bash
npm install --legacy-peer-deps   # npm's resolver trips over an esbuild peer range
npm run dev                      # http://localhost:3000
npm run build                    # production bundle in dist/
npm run lint                     # tsc --noEmit
```

`--legacy-peer-deps` is only needed for a clean install; an existing `node_modules` is fine.

## Deployment

The game is a static bundle, so any static host works. It is currently on Vercel:

```bash
npm run build
vercel deploy --prod        # from a directory holding index.html + assets/
```

Nothing at runtime is server-side: no API keys, no environment variables, no database.

## How it is built

- **React 19 + TypeScript + Vite 8**, Tailwind CSS v4 for the HUD and menus.
- **Three.js** renders the whole world: a faceted dune mesh and wet-sand strip, an animated ocean,
  the breaker, and every prop. Flat shading with non-indexed geometry keeps the low-poly facets.
- **Web Audio** synthesises all sound at runtime — no audio files ship with the game.
- No assets are downloaded at runtime apart from the two display fonts.

### Things worth knowing in the code

- `src/game3d.ts` owns the scene. Gameplay state lives in `App.tsx` and is pushed into the engine
  once per frame through `Wrackline3D.update()`.
- **`groundHeightAt( x, z )`** is the single source of truth for where the beach surface is.
  Scenery, loot, and the player are all bedded onto it, so nothing floats or sinks as the slope
  changes across the shore.
- **The breaker is re-draped every frame.** `waveSurfaceY()` returns the waterline under the wave
  (the sand it is crossing, or sea level once the beach drops below it) and the swell, foam and
  shallow sheet are rebuilt on top of it. That is what keeps the surge attached to the sea instead
  of reading as a separate slab sliding over dry sand.
- The tide cycle is a small state machine (`LOW_TIDE` → `WARNING` → `WAVE_SWEEP` → `WAVE_RETREAT`)
  driven by `phaseTimer`, and the same ratio that moves the wave drives its collision check.

## Project layout

```
index.html          shell, fonts, tab icon
src/main.tsx        entry
src/App.tsx         game state, HUD, input, the frame loop
src/game3d.ts       Three.js world: terrain, ocean, breaker, scenery, creature, particles
src/Logo.tsx        the badge mark and wordmark
src/audio.ts        procedural Web Audio
```
