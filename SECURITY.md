# Security policy

## What this project is

WRACKLINE is a static client-side game. There is no server, no API, no database, no user
account and no analytics. The build is HTML, CSS, JavaScript and one PNG, served from a CDN.
Nothing you do in the game leaves your browser, other than the fonts fetched from Google Fonts.

The only things the game stores are your best score and, if you make a share card, the name
you sign it with. They live in `localStorage` under the keys `wrackline_best` and
`wrackline_name`, and they are never sent anywhere: the share card is drawn in the browser,
and a name only leaves the device inside the image you save and then choose to share yourself.
Clearing site data erases both.

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
  to win except your own number. The same goes for the name on a share card, which is drawn
  as typed and is nobody's identity but the player's own claim.
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
