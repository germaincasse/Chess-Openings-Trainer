import { defineDict } from '../define';

export default defineDict(
  {
    // header
    train: "S'entraîner",
    exportPgn: 'Exporter PGN',
    importPgn: 'Importer PGN',
    clear: 'Vider',
    fileWhite: 'repertoire-blancs.pgn',
    fileBlack: 'repertoire-noirs.pgn',
    clearConfirm:
      "Vider le répertoire {color} ? {moves} et la progression d'entraînement seront supprimés. " +
      'Pensez à exporter un PGN ou une sauvegarde avant.',
    cleared: 'Répertoire {color} vidé.',

    // stats
    statPositions_one: 'position',
    statPositions_other: 'positions',
    statMoves_one: 'coup',
    statMoves_other: 'coups',
    statLines_one: 'ligne',
    statLines_other: 'lignes',
    statCards_one: 'position à connaître',
    statCards_other: 'positions à connaître',
    statCardsTitle: "Positions où c'est à vous de jouer : chacune est une carte d'entraînement",
    statDue: 'à réviser',

    // tree
    tree: 'Arbre',
    searchPlaceholder: 'Ouverture (nom anglais ou ECO)',
    expandAll: 'Tout déplier',
    collapseAll: 'Tout replier',
    treeHelp: "Vos coups en clair, ceux de l'adversaire en gris. Cliquez sur un coup pour l'ouvrir dans l'explorateur.",
    expand: 'Déplier',
    collapse: 'Replier',
    openInExplorer: "Ouvrir dans l'explorateur",
    trainLine: "S'entraîner sur cette ligne",
    transposition: 'transposition',
    transpositionTitle: "Cette position est déjà développée plus haut dans l'arbre",
    branches_one: '{count} suite',
    branches_other: '{count} suites',
    noSearchHit: 'Aucune ouverture de ce nom dans le répertoire.',

    // PGN import
    pgnTitle: 'Importer un PGN dans le répertoire {color}',
    close: 'Fermer',
    pgnHelp:
      'Toutes les lignes sont ajoutées, variantes comprises. Les parties qui commencent depuis une position ' +
      'personnalisée (en-tête FEN) sont ignorées.',
    pgnChooseFile: 'Choisir un fichier .pgn',
    pgnOrPaste: 'ou collez le texte ci-dessous',
    pgnImportText: 'Importer le texte',
    pgnNoMoves: 'Aucun coup lisible dans ce PGN.',
    pgnNothingNew: 'Aucun nouveau coup : lignes déjà présentes ou illisibles.',
    pgnAdded_one: '{count} coup ajouté au répertoire {color}.',
    pgnAdded_other: '{count} coups ajoutés au répertoire {color}.',
    readFailed: 'Lecture impossible : {error}',

    // empty repertoire
    emptyTitle: 'Le répertoire {color} est vide',
    emptyWays: 'Trois façons de le remplir :',
    wayExplorer: "Dans l'explorateur",
    wayExplorerHelp:
      'Activez le mode édition (chaque coup joué est ajouté) ou jouez une ligne puis cliquez sur « {button} ».',
    wayExplorerBtn: 'Explorateur en mode édition',
    wayGames: 'Depuis vos parties',
    wayGamesHelp:
      'Importez vos parties Lichess ou Chess.com : le répertoire est construit à partir des coups que vous jouez réellement.',
    wayGamesBtn: 'Importer mes parties',
    wayPgn: 'Depuis un PGN',
    wayPgnHelp: "Chargez un fichier PGN (avec variantes) issu d'un livre, d'un cours ou d'une étude.",
    wayPgnBtn: 'Importer un PGN',
  },
  {
    train: 'Train',
    exportPgn: 'Export PGN',
    importPgn: 'Import PGN',
    clear: 'Clear',
    fileWhite: 'repertoire-white.pgn',
    fileBlack: 'repertoire-black.pgn',
    clearConfirm:
      'Clear the {color} repertoire? {moves} and the training progress will be deleted. ' +
      'Consider exporting a PGN or a backup first.',
    cleared: '{color} repertoire cleared.',

    statPositions_one: 'position',
    statPositions_other: 'positions',
    statMoves_one: 'move',
    statMoves_other: 'moves',
    statLines_one: 'line',
    statLines_other: 'lines',
    statCards_one: 'position to know',
    statCards_other: 'positions to know',
    statCardsTitle: 'Positions where it is your move: each one is a training card',
    statDue: 'due for review',

    tree: 'Tree',
    searchPlaceholder: 'Opening (English name or ECO)',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    treeHelp: "Your moves are bright, your opponent's are grey. Click a move to open it in the explorer.",
    expand: 'Expand',
    collapse: 'Collapse',
    openInExplorer: 'Open in the explorer',
    trainLine: 'Train this line',
    transposition: 'transposition',
    transpositionTitle: 'This position is already expanded higher up in the tree',
    branches_one: '{count} continuation',
    branches_other: '{count} continuations',
    noSearchHit: 'No opening by that name in the repertoire.',

    pgnTitle: 'Import a PGN into the {color} repertoire',
    close: 'Close',
    pgnHelp:
      'Every line is added, variations included. Games starting from a custom position (FEN header) are skipped.',
    pgnChooseFile: 'Choose a .pgn file',
    pgnOrPaste: 'or paste the text below',
    pgnImportText: 'Import text',
    pgnNoMoves: 'No readable move in this PGN.',
    pgnNothingNew: 'No new move: the lines are already there or could not be read.',
    pgnAdded_one: '{count} move added to the {color} repertoire.',
    pgnAdded_other: '{count} moves added to the {color} repertoire.',
    readFailed: 'Could not read the file: {error}',

    emptyTitle: 'The {color} repertoire is empty',
    emptyWays: 'Three ways to fill it:',
    wayExplorer: 'In the explorer',
    wayExplorerHelp: 'Turn on edit mode (every move you play is added) or play a line, then click "{button}".',
    wayExplorerBtn: 'Explorer in edit mode',
    wayGames: 'From your games',
    wayGamesHelp:
      'Import your Lichess or Chess.com games: the repertoire is built from the moves you actually play.',
    wayGamesBtn: 'Import my games',
    wayPgn: 'From a PGN',
    wayPgnHelp: 'Load a PGN file (with variations) from a book, a course or a study.',
    wayPgnBtn: 'Import a PGN',
  },
);
