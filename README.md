# Chess Openings Trainer

A web app to build, analyse and review your chess opening repertoire. It runs entirely in the browser: no account, no server.

Live: https://germaincasse.github.io/Chess-Openings-Trainer/

## Features

- **Explorer**: a board with chess.com interactions (drag or click to move, right-click arrows and highlights, promotion picker, arrow keys to navigate, X to flip the board), and statistics from your own games at every position (move frequencies, results).
- **Move quality**: with Stockfish on, every move (your repertoire, your games, the displayed line) gets its evaluation and a chess.com-style badge (best, excellent, good, inaccuracy, mistake, blunder).
- **White and Black repertoires**: stored as a position graph, so transpositions share the same position. Collapsible tree, comments, main line, adding moves in edit mode or line by line.
- **Stockfish 19 lite** in the browser (WebAssembly, single-threaded, works on GitHub Pages): evaluation, multiple lines, arrows.
- **Opening names** from the [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) dataset (CC0).
- **Lichess and Chess.com game import** through their public APIs, to build your repertoire automatically from the moves you actually play.
- **Weakness detection**: theory mistakes flagged by the engine, lines with poor results, inconsistencies between your repertoire and your games, repertoire gaps.
- **Training**: first your opening mistakes (found by Stockfish in your games), fixed in the repertoire and then replayed line by line; then spaced repetition, where every position where it is your move becomes a card reviewed at the right time.
- **French and English interface**, board and piece themes, wooden piece sounds.
- **PGN import and export** (variations included).
- **Full JSON backup** (repertoires, training progress, imported games, settings) and restore.

## Privacy

All data stays in the browser (IndexedDB). Nothing is sent to a server: the only network requests are loading the site and, when importing, direct calls to the Lichess and Chess.com APIs.

The trade-off: your data is tied to this browser on this device and disappears if the site data is cleared. Export a backup regularly from the **Data** tab.

## Development

Requirements: Node.js 22 or later.

```sh
npm install        # dependencies
npm run dev        # development server
npm run build      # TypeScript check and production build into dist/
npm run openings   # regenerates public/openings.json from lichess-org/chess-openings
node scripts/fetch-pieces.mjs   # downloads the piece sets into public/pieces/
```

`npm run dev` and `npm run build` first copy the Stockfish engine (`node_modules/stockfish/bin`) into `public/engine/`.

## Deployment

The `.github/workflows/deploy.yml` workflow builds and publishes the site to GitHub Pages on every push to `main` (or manually from the Actions tab).

One-time setup in the GitHub repository: **Settings > Pages > Source: GitHub Actions**.

## Stack and licenses

- Vite, React 19, TypeScript
- [chessground](https://github.com/lichess-org/chessground) (GPL-3.0) for the board
- [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0) for Stockfish 19 in WebAssembly
- [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause) for the rules
- [idb-keyval](https://github.com/jakearchibald/idb-keyval) (Apache-2.0) for IndexedDB
- Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0)
- Piece sets from [lichess-org/lila](https://github.com/lichess-org/lila): cburnett and merida (GPLv2+), mpchess (GPL), chessnut (Apache 2.0, Alexis Luengas), spatial, fantasy and celtic (MIT, Maurizio Monge), rhosgfx (CC0). Credits and license texts: [public/pieces/NOTICES.md](public/pieces/NOTICES.md)

Since chessground and stockfish.js are GPL-3.0, this project is distributed under the **GPL-3.0** license (see [LICENSE](LICENSE)).
