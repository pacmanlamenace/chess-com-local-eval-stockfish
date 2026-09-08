# Chess.com Local Eval (StockFish) for Firefox

A small, privacy-friendly Firefox extension that analyzes **completed** Chess.com games on your computer. It does not call Chess.com's paid analysis endpoints, reproduce subscriber-only pages, or send moves to a remote service.

> **Fair-play boundary:** the extension deliberately disables its launch button whenever a game appears live or in progress. Use it only after a game is over and in accordance with Chess.com's rules. Page markup changes over time, so the guard is intentionally conservative; never use any analysis tool during active play.

## What version 1.0 includes

- Completed-game detection and a visible live-game lock
- PGN extraction from page fields, move metadata, or the visible move list
- Chess.com figurine-notation decoding when piece letters are rendered as icons
- Bundled Stockfish.js 18.0.8 lite single-threaded WebAssembly engine
- Evaluation graph and move-by-move evaluation
- Clickable evaluation-timeline dots colored by move quality
- Post-move board icons for brilliant (`!!`), good (`✓`), inaccuracy (`?!`), mistake (`?`), and blunder (`??`) moves
- Best move and its principal variation
- Previous/next move navigation
- Board synchronization during move navigation
- Best-move arrow, square highlights, a readable coordinate line, and a large evaluation bar with its score
- Visible Stockfish depth with a user-selectable rerun depth from 8 through 18

If Firefox cannot initialize the bundled engine, the panel reports a bounded
startup error instead of hanging.

## Install from Mozilla Add-ons

Install the signed extension from its
[Mozilla Add-ons page](https://addons.mozilla.org/en-US/firefox/addon/chess-com-local-eval/).
The unsigned release ZIP in this repository is intended
for AMO submission and temporary developer installation; standard Firefox
builds require Mozilla signing for permanent installation.

## Install temporarily in Firefox

1. Open Firefox and enter `about:debugging` in the address bar.
2. Choose **This Firefox**.
3. Click **Load Temporary Add-on…**.
4. Select this project's `manifest.json`.
5. Open a completed game on Chess.com. The **Review locally** button appears at the lower right.

The active extension version is displayed immediately above the button. After reloading the extension in `about:debugging`, also refresh any Chess.com tabs that were already open so Firefox replaces the previously injected content script.

Temporary extensions disappear when Firefox restarts.

## Bundled Stockfish WASM

This package includes **Stockfish.js 18.0.8, lite single-threaded**, published by the [Stockfish.js project](https://github.com/nmrugg/stockfish.js). The single-threaded lite build is well suited to a Firefox extension because it does not require cross-origin isolation or shared-memory headers.

```text
engine/
  stockfish/
    stockfish.js
    stockfish.wasm
    COPYING.txt
    README.md
    UPSTREAM_README.md
    package.json
```

The extension starts this build as a dedicated background Web Worker. Following the upstream loader pattern, `stockfish.js` resolves its same-basename `stockfish.wasm` companion automatically. The adapter communicates through ordinary UCI commands (`position fen`, `go depth`, and `MultiPV`). If the engine cannot initialize, the panel reports a bounded startup error instead of hanging.

Stockfish.js and Stockfish are GPLv3 software. The exact npm package version,
upstream commit, release URLs, and checksums are recorded in
`engine/stockfish/README.md`. Retain the license and provenance files when
redistributing the extension.

## Package the extension

Create a ZIP whose root contains `manifest.json` (not an extra enclosing directory). On PowerShell, from this folder:

```powershell
web-ext build --overwrite-dest
```

The resulting archive includes the bundled engine and its notices.

## Project structure

```text
manifest.json                 Firefox WebExtension MV3 manifest
background.js                 Stockfish worker host and local analysis message bridge
content.js                    Page detection, extraction, analysis, and panel UI
styles.css                    Isolated panel/launcher styling
popup.html / popup.css        Toolbar help popup
icons/icon.svg                Scalable toolbar and add-on icon
lib/chess-lite.js             Minimal PGN/SAN-to-FEN replay library
engine/stockfish/             Bundled Stockfish.js 18.0.8 WASM build and notices
PRIVACY.md                    Plain-language privacy policy
LICENSE.md                    Project and third-party license summary
```

## How the safety guard works

Before enabling or starting analysis, the content script checks Chess.com's dedicated result elements and known completed-game text as well as active clock markers and live-game controls. A definitive result takes precedence over stale clock/control elements that Chess.com may leave mounted after a game. Analysis is enabled only when the game is recognized as completed. The check runs periodically because Chess.com uses client-side navigation.

This is defense in depth, not a promise that third-party page markup will never change. If Chess.com changes its DOM, update the selectors and test the guard before relying on the extension.

## Known limitations

- Chess.com can change its HTML, class names, and move-list components.
- Some archive pages do not expose their moves until the move list or analysis view is opened.
- The lightweight PGN reader handles standard SAN, castling, promotions, en passant, and FEN starts, but it is not a full chess legality validator.
- Candidate lines are displayed in UCI coordinate notation in this first version.
- Brilliant moves are a conservative local estimate: the played move must match Stockfish's first choice, score substantially better than its second choice, and offer a meaningful material sacrifice that is accepted on the following move. It may differ from labels produced by other analysis services.
- Analysis uses one engine thread, a 16 MB hash, animation-frame yielding, and adaptive depth 8–10 so Firefox remains responsive. Short games receive slightly deeper analysis than long games.
- The rerun selector offers depth 8–18. Deeper full-game runs can take substantially longer, especially for long games.
- The extension does not imitate Chess.com's paid UI or use paid/internal endpoints.

## Privacy

No analytics, accounts, remote APIs, storage, or network requests are used by
the extension. Game moves are read from the currently open page and processed
locally. See `PRIVACY.md`.

## Troubleshooting

- **Button says “Open a completed game”:** open the finished game's move list or analysis page.
- **Button says analysis is locked:** the page still exposes live-game signals. Wait for the result to appear or open the game from your archive.
- **Moves could not be found:** expand the move list, then retry.
- **Stockfish fails to load:** check the Firefox worker console in
  `about:debugging` and confirm that both `stockfish.js` and `stockfish.wasm`
  are present below `engine/stockfish/`.

## License

The first-party extension code, interface, artwork, documentation, and branding
are all rights reserved. Stockfish.js 18.0.8 and its Stockfish-derived WASM
binary remain third-party GPLv3 software. See `LICENSE.md`,
`engine/stockfish/COPYING.txt`, and `engine/stockfish/README.md`.
