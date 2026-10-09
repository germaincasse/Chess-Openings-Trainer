import { defineDict } from '../define';

export default defineDict(
  {
    'kind.engine': 'Erreurs théoriques',
    'kind.results': 'Lignes difficiles',
    'kind.consistency': 'Incohérences',
    'kind.gap': 'Trous du répertoire',
    'level.inaccuracy': 'Imprécision',
    'level.mistake': 'Erreur',
    'level.blunder': 'Gaffe',

    resultsMineTitle: 'Votre coup {move} vous réussit mal',
    resultsOppTitle: 'Vous peinez contre {move}',
    resultsDetail_one: '{score} de points sur {count} partie ({record}), contre {before} juste avant.',
    resultsDetail_other: '{score} de points sur {count} parties ({record}), contre {before} juste avant.',

    noFixedTitle: 'Pas de coup fixe dans cette position',
    noFixedFirstTitle: 'Pas de premier coup fixe',
    noFixedDetail: "Vous alternez entre {moves}. Choisir une ligne aide à l'approfondir.",
    deviationTitle: 'Écart avec votre répertoire ({move})',
    deviationDetail_one: 'Votre répertoire prévoit {planned}, mais en partie vous jouez {played} ({count} fois).',
    deviationDetail_other: 'Votre répertoire prévoit {planned}, mais en partie vous jouez {played} ({count} fois).',

    gapKnownTitle: 'Pas de réponse préparée à {move}',
    gapMissingTitle: "{move} n'est pas dans votre répertoire",
    gapDetail_one: "Rencontré {count} fois ({score} de points). Ajoutez votre réponse depuis l'explorateur.",
    gapDetail_other: "Rencontré {count} fois ({score} de points). Ajoutez votre réponse depuis l'explorateur.",

    'engineTitle.inaccuracy': 'Imprécision : {move}',
    'engineTitle.mistake': 'Erreur : {move}',
    'engineTitle.blunder': 'Gaffe : {move}',
    engineDetail_one:
      'Joué {count} fois ({score} de points). Stockfish préfère {best} : {bestEval} contre {playedEval} après {played} (profondeur {depth}).',
    engineDetail_other:
      'Joué {count} fois ({score} de points). Stockfish préfère {best} : {bestEval} contre {playedEval} après {played} (profondeur {depth}).',

    progressWhite: 'Stockfish analyse vos coups avec les Blancs',
    progressBlack: 'Stockfish analyse vos coups avec les Noirs',

    noGames: 'Aucune partie à analyser avec les cadences sélectionnées.',
    searching: 'Recherche des positions fréquentes…',
    cancelled: 'Analyse annulée. Les évaluations déjà calculées sont gardées pour la prochaine fois.',
    done_one: 'Analyse terminée : {count} point faible trouvé.',
    done_other: 'Analyse terminée : {count} points faibles trouvés.',
    doneNone: 'Analyse terminée : aucun point faible avec ces réglages.',
    unknownError: "Erreur inconnue pendant l'analyse.",
  },
  {
    'kind.engine': 'Theory mistakes',
    'kind.results': 'Tough lines',
    'kind.consistency': 'Inconsistencies',
    'kind.gap': 'Repertoire gaps',
    'level.inaccuracy': 'Inaccuracy',
    'level.mistake': 'Mistake',
    'level.blunder': 'Blunder',

    resultsMineTitle: 'Your move {move} scores poorly',
    resultsOppTitle: 'You struggle against {move}',
    resultsDetail_one: '{score} scored over {count} game ({record}), against {before} just before.',
    resultsDetail_other: '{score} scored over {count} games ({record}), against {before} just before.',

    noFixedTitle: 'No settled move in this position',
    noFixedFirstTitle: 'No settled first move',
    noFixedDetail: 'You alternate between {moves}. Picking one line helps you study it in depth.',
    deviationTitle: 'Deviation from your repertoire ({move})',
    deviationDetail_one: 'Your repertoire plays {planned}, but in your games you play {played} ({count} time).',
    deviationDetail_other: 'Your repertoire plays {planned}, but in your games you play {played} ({count} times).',

    gapKnownTitle: 'No prepared answer to {move}',
    gapMissingTitle: '{move} is not in your repertoire',
    gapDetail_one: 'Faced {count} time ({score} scored). Add your answer from the explorer.',
    gapDetail_other: 'Faced {count} times ({score} scored). Add your answer from the explorer.',

    'engineTitle.inaccuracy': 'Inaccuracy: {move}',
    'engineTitle.mistake': 'Mistake: {move}',
    'engineTitle.blunder': 'Blunder: {move}',
    engineDetail_one:
      'Played {count} time ({score} scored). Stockfish prefers {best}: {bestEval} against {playedEval} after {played} (depth {depth}).',
    engineDetail_other:
      'Played {count} times ({score} scored). Stockfish prefers {best}: {bestEval} against {playedEval} after {played} (depth {depth}).',

    progressWhite: 'Stockfish is checking your moves with White',
    progressBlack: 'Stockfish is checking your moves with Black',

    noGames: 'No games to analyse with the selected time controls.',
    searching: 'Looking for frequent positions…',
    cancelled: 'Analysis cancelled. Evaluations already computed are kept for next time.',
    done_one: 'Analysis done: {count} weakness found.',
    done_other: 'Analysis done: {count} weaknesses found.',
    doneNone: 'Analysis done: no weakness with these settings.',
    unknownError: 'Unknown error during the analysis.',
  },
);
