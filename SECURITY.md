# Security policy

## What this project is

WRACKLINE is a client-side game with one small serverless function behind it. The build is HTML,
CSS, JavaScript and one PNG, served from a CDN. There are no accounts, no cookies, and no
analytics.

The function, `api/leaderboard.ts`, exists only for the tide boards. When it is configured with
durable storage it accepts a finished run — a random device id, a run id, the display name, the
score, the wave reached, the tide and the run duration — and answers with the board. When it is
not configured it answers `503` and the game keeps everything on the device. It has no session, no
credential and no endpoint that reveals anything but the board rows people chose to submit.

What the game stores on a device is your best score, the name that signs a share card, your daily
progress and the run kept on the local board. They live in `localStorage` under `wrackline_*`
keys. Clearing site data erases them. The share card is drawn in the browser, so a name only leaves
the device inside the image you save and then choose to share yourself.

## What is in scope

Most of the usual web attack surface does not exist here. Reports that are genuinely useful:

- Something that runs on a visitor's machine that should not, whether from the app or from
  anything pulled in at build time.
- A secret, key or credential that has been committed or shipped in the built output.
- A supply chain problem in a dependency or in the build pipeline.
- Anything in the deployed site that lets a visitor be attacked, framed or redirected.
- A way to make the leaderboard endpoint do more than hold a validated run: injection through a
  name, a player id or a board id, a request that is not rate limited, or a write that lands on a
  board or a day the submitter does not control.
- A way to make the endpoint report `storage: 'durable'` when nothing was persisted.

## What is out of scope

- **The local score can be edited.** It is stored in `localStorage`, so a player can give
  themselves any best score they like on their own device. That is known, and it is fine.
- **The world board is self-reported.** Scores are claimed by the client. The endpoint rejects
  scores that are not whole, positive, inside a season, or possible in the reported run time, and
  it rate limits submissions per address — that stops a lazy edit, not a determined cheater. A
  board without signed runs or replays cannot be cheat-proof, and this one does not claim to be.
  "I submitted 5,000,000" is a validation report only if it gets past those checks.
- A name that is drawn as typed on a board row or a share card. It is sanitized for control
  characters and length, and it is nobody's identity but the player's own claim.
- Missing hardening headers on a page that serves no user content and holds no session.

## Reporting

Email **sithunyein.mailto@gmail.com** with a subject starting `WRACKLINE security`, or open a
[private security advisory](https://github.com/thesithunyein/wrackline/security/advisories/new)
on GitHub. Please do not open a public issue for something exploitable.

Include what you did, what happened, and what you expected. A short reproduction is worth more
than a long description.

## What to expect

- An acknowledgement within a few days.
- A straight answer about whether it is in scope, and a fix or a reason if it is not.
- Credit in the fix commit if you would like it.

## Supported versions

The deployed site and the `main` branch are the only versions that receive fixes.
