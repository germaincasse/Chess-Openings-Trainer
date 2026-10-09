import { defineDict } from '../define';

export default defineDict(
  {
    title: 'Analyse',
    noGames:
      "L'analyse s'appuie sur les ouvertures que vous jouez réellement : importez d'abord vos parties Lichess ou Chess.com pour voir vos ouvertures, vos scores et vos points faibles.",
    importGames: 'Importer mes parties',

    // time controls
    speeds: 'Cadences prises en compte',
    speedsHelp:
      "Ce filtre s'applique aussi aux statistiques de vos parties dans l'explorateur et à la génération du répertoire.",

    // openings
    openings: 'Vos ouvertures',
    byFamily: 'Regrouper par famille',
    totalScore: '{games}, score {score}',
    noGamesColor: 'Aucune partie avec les {color} pour ces cadences.',
    colOpening: 'Ouverture',
    colGames: 'Parties',
    colScore: 'Score',
    colResults: 'Résultats',
    openInExplorer: "Ouvrir dans l'explorateur",
    moreOpenings_one: 'Afficher plus ({count} autre ouverture)',
    moreOpenings_other: 'Afficher plus ({count} autres ouvertures)',

    // weakness options
    weaknesses: 'Points faibles',
    weaknessesHelp:
      'Cherche dans vos parties les lignes où vous perdez des points, les positions où vous hésitez entre plusieurs coups, les réponses adverses fréquentes absentes de votre répertoire et, avec Stockfish, les coups habituels qui sont théoriquement faibles.',
    minGames: 'Parties minimum par position',
    minGamesHelp: "Une position n'est examinée que si vous l'avez atteinte au moins ce nombre de fois.",
    maxPly: 'Profondeur maximale (en coups)',
    maxPlyHelp: "Jusqu'où descendre dans vos lignes, en coups de chaque camp.",
    engine: 'Analyse Stockfish',
    engineOn: 'Activée',
    engineOff: 'Désactivée',
    engineHelp: 'Vérifie vos coups habituels avec le moteur. Peut prendre plusieurs minutes.',
    depth: 'Profondeur Stockfish',
    depthRecommended: '{depth} (conseillé)',
    depthHelp: 'Plus haut : plus fiable mais plus lent.',
    maxPositions: 'Positions analysées par couleur',
    maxPositionsHelp: "Les plus fréquentes d'abord.",
    sensitivity: 'Sensibilité',
    sensHigh: 'Haute',
    sensNormal: 'Normale',
    sensLow: 'Basse',
    sensTitle: 'Signale un coup qui fait perdre au moins {value} points de chances de gain',
    sensHelp: 'Perte minimale de chances de gain, en points de pourcentage, pour signaler un coup.',

    // run
    cancel: 'Annuler',
    runningHelp:
      "L'analyse moteur peut prendre plusieurs minutes. Vous pouvez changer d'onglet : elle continue en arrière-plan.",
    run: 'Analyser mes ouvertures',
    noGamesSpeeds: 'Aucune partie pour les cadences choisies.',
    noReport: "Aucun rapport pour l'instant : lancez l'analyse pour repérer vos points faibles.",

    // report
    report: 'Rapport',
    clear: 'Effacer',
    clearConfirm: 'Effacer ce rapport ?',
    reportMeta: 'Analyse du {date} à {time}, sur {games} ; {engine}.',
    reportEngine: 'Stockfish profondeur {depth}, {positions} par couleur',
    reportNoEngine: 'sans Stockfish',
    stale:
      'Vos parties ou le filtre de cadences ont changé depuis cette analyse ({games} maintenant) : relancez-la pour la mettre à jour.',
    all: 'Tout ({n})',
    noneFound:
      'Aucun point faible trouvé avec ces réglages. Essayez une sensibilité plus haute ou moins de parties minimum par position.',
    noneInCategory: 'Rien dans cette catégorie.',
    moreWeak_one: 'Afficher plus ({count} autre point faible)',
    moreWeak_other: 'Afficher plus ({count} autres points faibles)',

    // weakness card
    fixed: 'Répertoire à jour',
    lineTitle: 'Ligne qui mène à la position',
    view: 'Voir',
    notInRep: "Cette position n'est pas dans votre répertoire : ajoutez-y d'abord la ligne.",
    train: "S'entraîner",
    fix: 'Corriger le répertoire',
    dismiss: 'Ignorer',
    dismissTitle: 'Retirer de la liste',

    // repertoire fix
    fixInvalid: 'Le coup du moteur est invalide dans cette position.',
    fixReplace: 'Remplacer {played} par {best} dans votre répertoire {color} ?',
    fixAdd: 'Ajouter {best} à votre répertoire {color} ?',
    fixRemovesTree: '{played} et ses sous-variantes ({positions}) seront retirés du répertoire.',
    fixRemoves: '{played} sera retiré du répertoire.',
    fixAddsPath: 'La ligne qui mène à cette position ({line}) sera aussi ajoutée.',
    fixContinuation: 'La suite proposée par Stockfish ({line}) sera ajoutée après {best}.',
    fixDone: '{best} est maintenant votre coup dans cette position (répertoire {color}).',
  },
  {
    title: 'Analysis',
    noGames:
      'The analysis relies on the openings you actually play: import your Lichess or Chess.com games first to see your openings, your scores and your weaknesses.',
    importGames: 'Import my games',

    speeds: 'Time controls included',
    speedsHelp: 'This filter also applies to your game statistics in the explorer and to repertoire generation.',

    openings: 'Your openings',
    byFamily: 'Group by family',
    totalScore: '{games}, score {score}',
    noGamesColor: 'No games with {color} for these time controls.',
    colOpening: 'Opening',
    colGames: 'Games',
    colScore: 'Score',
    colResults: 'Results',
    openInExplorer: 'Open in the explorer',
    moreOpenings_one: 'Show more ({count} more opening)',
    moreOpenings_other: 'Show more ({count} more openings)',

    weaknesses: 'Weaknesses',
    weaknessesHelp:
      'Searches your games for the lines where you drop points, the positions where you hesitate between several moves, the frequent opponent replies missing from your repertoire and, with Stockfish, your usual moves that are theoretically weak.',
    minGames: 'Minimum games per position',
    minGamesHelp: 'A position is only examined if you reached it at least this many times.',
    maxPly: 'Maximum depth (in moves)',
    maxPlyHelp: 'How far to go down your lines, in moves per side.',
    engine: 'Stockfish analysis',
    engineOn: 'On',
    engineOff: 'Off',
    engineHelp: 'Checks your usual moves with the engine. Can take several minutes.',
    depth: 'Stockfish depth',
    depthRecommended: '{depth} (recommended)',
    depthHelp: 'Higher: more reliable but slower.',
    maxPositions: 'Positions analysed per colour',
    maxPositionsHelp: 'Most frequent first.',
    sensitivity: 'Sensitivity',
    sensHigh: 'High',
    sensNormal: 'Normal',
    sensLow: 'Low',
    sensTitle: 'Flags a move that loses at least {value} points of winning chances',
    sensHelp: 'Minimum loss of winning chances, in percentage points, to flag a move.',

    cancel: 'Cancel',
    runningHelp: 'The engine analysis can take several minutes. You can switch tabs: it keeps running in the background.',
    run: 'Analyse my openings',
    noGamesSpeeds: 'No games for the selected time controls.',
    noReport: 'No report yet: run the analysis to spot your weaknesses.',

    report: 'Report',
    clear: 'Clear',
    clearConfirm: 'Clear this report?',
    reportMeta: 'Analysis of {date} at {time}, over {games}; {engine}.',
    reportEngine: 'Stockfish depth {depth}, {positions} per colour',
    reportNoEngine: 'without Stockfish',
    stale: 'Your games or the time control filter changed since this analysis ({games} now): run it again to update it.',
    all: 'All ({n})',
    noneFound: 'No weakness found with these settings. Try a higher sensitivity or fewer minimum games per position.',
    noneInCategory: 'Nothing in this category.',
    moreWeak_one: 'Show more ({count} more weakness)',
    moreWeak_other: 'Show more ({count} more weaknesses)',

    fixed: 'Repertoire up to date',
    lineTitle: 'Line leading to the position',
    view: 'View',
    notInRep: 'This position is not in your repertoire: add the line to it first.',
    train: 'Train',
    fix: 'Fix the repertoire',
    dismiss: 'Dismiss',
    dismissTitle: 'Remove from the list',

    fixInvalid: 'The engine move is not legal in this position.',
    fixReplace: 'Replace {played} with {best} in your {color} repertoire?',
    fixAdd: 'Add {best} to your {color} repertoire?',
    fixRemovesTree: '{played} and its sub-variations ({positions}) will be removed from the repertoire.',
    fixRemoves: '{played} will be removed from the repertoire.',
    fixAddsPath: 'The line leading to this position ({line}) will be added as well.',
    fixContinuation: "Stockfish's follow-up ({line}) will be added after {best}.",
    fixDone: '{best} is now your move in this position ({color} repertoire).',
  },
);
