# Bundled Stockfish engine

This directory contains Stockfish.js 18.0.8's lite single-threaded browser build:

- `stockfish.js`
- `stockfish.wasm`
- `COPYING.txt` (GPLv3)
- `UPSTREAM_README.md`
- `package.json` (exact package metadata)

The files are copied without modification from these npm package paths and
renamed so the upstream loader resolves its same-basename WASM companion:

| Packaged path | npm package path | SHA-256 |
| --- | --- | --- |
| `stockfish.js` | `bin/stockfish-18-lite-single.js` | `5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391` |
| `stockfish.wasm` | `bin/stockfish-18-lite-single.wasm` | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` |

Exact release provenance:

- npm package: https://www.npmjs.com/package/stockfish/v/18.0.8
- npm tarball: https://registry.npmjs.org/stockfish/-/stockfish-18.0.8.tgz
- npm integrity: `sha512-z+f2UMPXLylDBGjv9e9zU8QulY7hUl8MYHesLRrdddewlOXjJrUSmtNmbtID1/F72EPhq0CCkCNxgWS5MQVWtQ==`
- upstream source commit: https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918
- build instructions: https://github.com/nmrugg/stockfish.js/blob/93c994592dcf3b4b21052ab925e9b534df9c0918/README.md#how-do-i-compile-the-engine

Keep the license and provenance files with the engine when redistributing it.
