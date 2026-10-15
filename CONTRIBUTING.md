# Contributing to WRACKLINE

Thanks for wanting to help. This is a small game and it is meant to stay readable.

## Ways to help

- **Play it and say what felt wrong.** Feel is the whole product. If a wave felt unfair, or the
  phone layout pinched, or a sound was too loud, say so and name the device you used.
- **Bug reports.** Include what you did, what happened, and what you expected. A note of the
  wave number and the tide you were on helps more than a stack trace here.
- **Ideas for the loop.** Read the [How it works](README.md#how-it-works) section first. The
  load bearing idea is that greed is the timer. A change that weakens that trade is usually a no,
  and the guide to that is the game itself: if it makes holding less of a decision, it is not
  the change to make.

## Getting it running

```bash
git clone https://github.com/thesithunyein/wrackline.git
cd wrackline
npm install --legacy-peer-deps
npm run dev
```

Before you open a pull request, both of these should pass:

```bash
npm run lint     # tsc --noEmit
npm run build
```

## House rules

- **One change per pull request.** The loop runs on one clock and one small state machine, so
  two changes at once make a regression impossible to trace back to its cause.
- **Match the file you are editing.** The code is written in plain English comments that explain
  why a thing is the way it is, not what the line does. Keep that voice.
- **No art or audio files.** The whole look is generated geometry and the whole soundtrack is
  synthesised at runtime. That constraint is part of the design, not an accident.
- **Do not add a dependency for something a few lines can do.** The bundle is already 840 KB
  before anything is downloaded.
- **Tune numbers rather than rewriting systems.** Difficulty, windows, speeds and colours are
  named constants at the top of `src/App.tsx` and inside `src/game3d.ts`. Most feel changes
  should be one number.
- **Keep it playable with a keyboard and with a thumb.** Both are first class. A change that
  only works with a mouse is half a change.
- **No em dashes in documentation.** House style, and the README gets read as much as the code.

## Commit messages

The history uses `feat:` and `fix:` prefixes, followed by a plain sentence describing the change:

```
fix: give the beach one surface, so wet sand only exists where the tide reaches
feat: hearts, a real win state, and a character you can see move on a phone
```

## Reporting something privately

Security issues go to [SECURITY.md](SECURITY.md), not to the issue tracker.

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE).
