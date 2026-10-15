# Security policy

## What this project is

WRACKLINE is a static client-side game. There is no server, no API, no database, no user
account and no analytics. The build is HTML, CSS, JavaScript and one PNG, served from a CDN.
Nothing you do in the game leaves your browser, other than the fonts fetched from Google Fonts.

The only thing the game stores is your best score, in `localStorage` under the key
`wrackline_best`. Clearing site data erases it.

## What is in scope

Most of the usual web attack surface does not exist here. Reports that are genuinely useful:

- Something that runs on a visitor's machine that should not, whether from the app or from
  anything pulled in at build time.
- A secret, key or credential that has been committed or shipped in the built output.
- A supply chain problem in a dependency or in the build pipeline.
- Anything in the deployed site that lets a visitor be attacked, framed or redirected.

## What is out of scope

- **The score can be edited.** It is stored in `localStorage`, so a player can give themselves
  any best score they like. That is known, and it is fine: there is no leaderboard, and nothing
  to win except your own number.
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
