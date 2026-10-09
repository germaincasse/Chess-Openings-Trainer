# Chess Openings Trainer

Application web pour construire, analyser et réviser son répertoire d'ouvertures aux échecs. Elle tourne entièrement dans le navigateur : pas de compte, pas de serveur.

En ligne : https://germaincasse.github.io/Chess-Openings-Trainer/

## Fonctionnalités

- **Explorateur** : échiquier avec les interactions de chess.com (glisser ou cliquer pour jouer, flèches et surlignages au clic droit, choix de la promotion), navigation dans la ligne, statistiques de vos propres parties à chaque position.
- **Répertoires Blancs et Noirs** : stockés comme un graphe de positions, les transpositions partagent la même position. Arbre repliable, commentaires, ligne principale, ajout en mode édition ou ligne par ligne.
- **Stockfish 19 lite** dans le navigateur (WebAssembly, mono-thread, compatible GitHub Pages) : évaluation, plusieurs lignes, flèches.
- **Noms d'ouvertures** issus du jeu de données [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0).
- **Import de parties Lichess et Chess.com** via leurs API publiques, pour construire automatiquement le répertoire à partir des coups réellement joués.
- **Détection des faiblesses** : erreurs théoriques signalées par le moteur, lignes aux mauvais résultats, incohérences entre le répertoire et vos parties, trous du répertoire.
- **Entraînement par répétition espacée** : chaque position où c'est à vous de jouer devient une carte, révisée au bon moment.
- **Import et export PGN** (variantes comprises).
- **Sauvegarde JSON** complète (répertoires, progression, parties importées, réglages) et restauration.

## Confidentialité

Toutes les données restent dans le navigateur (IndexedDB). Rien n'est envoyé sur un serveur : les seules requêtes réseau sont le chargement du site et, à l'import, les appels directs aux API de Lichess et Chess.com.

Contrepartie : les données sont liées à ce navigateur sur cet appareil. Elles disparaissent si les données du site sont effacées. Exportez régulièrement une sauvegarde depuis l'onglet **Données**.

## Développement

Prérequis : Node.js 22 ou plus récent.

```sh
npm install        # dépendances
npm run dev        # serveur de développement
npm run build      # vérification TypeScript et build dans dist/
npm run openings   # régénère public/openings.json depuis lichess-org/chess-openings
```

`npm run dev` et `npm run build` copient d'abord le moteur Stockfish (`node_modules/stockfish/bin`) dans `public/engine/`.

## Déploiement

Le workflow `.github/workflows/deploy.yml` construit et publie le site sur GitHub Pages à chaque push sur `main` (ou à la main depuis l'onglet Actions).

À faire une seule fois dans le dépôt GitHub : **Settings > Pages > Source : GitHub Actions**.

## Stack et licences

- Vite, React 19, TypeScript
- [chessground](https://github.com/lichess-org/chessground) (GPL-3.0) pour l'échiquier
- [stockfish.js](https://github.com/nmrugg/stockfish.js) (GPL-3.0) pour Stockfish 19 en WebAssembly
- [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause) pour les règles
- [idb-keyval](https://github.com/jakearchibald/idb-keyval) (Apache-2.0) pour IndexedDB
- Noms d'ouvertures : [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0)

chessground et stockfish.js étant sous GPL-3.0, ce projet est distribué sous licence **GPL-3.0** (voir [LICENSE](LICENSE)).
