import { defineDict } from '../define';

export default defineDict(
  {
    // navigation
    'nav.explorer': 'Explorateur',
    'nav.repertoire': 'Répertoire',
    'nav.training': 'Entraînement',
    'nav.import': 'Import',
    'nav.analysis': 'Analyse',
    'nav.data': 'Données',
    loading: 'Chargement…',
    langGroup: 'Langue / Language',
    langEn: 'English',
    langFr: 'Français',

    // colors
    white: 'Blancs',
    black: 'Noirs',
    both: 'Les deux',
    whiteRep: 'Répertoire Blancs',
    blackRep: 'Répertoire Noirs',

    // speeds and sites
    'speed.ultrabullet': 'UltraBullet',
    'speed.bullet': 'Bullet',
    'speed.blitz': 'Blitz',
    'speed.rapid': 'Rapide',
    'speed.classical': 'Classique',
    'speed.daily': 'Par correspondance',

    // shared chess wording
    startPosition: 'Position de départ',
    unknownOpening: 'Ouverture non répertoriée',
    unlistedOpening: 'Ouverture non répertoriée',
    playAMove: "Jouez un coup sur l'échiquier.",
    wdlTitle: '{w} victoires, {d} nulles, {l} défaites',
    games_one: '{count} partie',
    games_other: '{count} parties',
    positions_one: '{count} position',
    positions_other: '{count} positions',
    moves_one: '{count} coup',
    moves_other: '{count} coups',
    or: 'ou',
    me: 'Moi',

    // move quality (chess.com style)
    'class.best': 'Meilleur coup',
    'class.excellent': 'Excellent',
    'class.good': 'Bon',
    'class.inaccuracy': 'Imprécision',
    'class.mistake': 'Erreur',
    'class.blunder': 'Gaffe',

    // engine
    engineLoadFailed: 'Impossible de charger Stockfish.',
    engineStopped: 'Moteur arrêté.',

    // storage
    saveFailed: 'Sauvegarde impossible : {error}',
    backupInvalid: "Ce fichier n'est pas une sauvegarde de Chess Openings Trainer.",

    // game import errors
    accountNotFound: 'Compte {site} "{user}" introuvable.',
    rateLimited: '{site} limite les requêtes : réessayez dans une minute.',
    httpError: 'Erreur {site} ({status}).',
    lichessProgress: '{count} parties reçues de Lichess',
    chesscomMonth: 'Chess.com : lecture des parties de {month}',
    chesscomKept: 'Chess.com : {count} parties retenues',
    anonymous: 'Anonyme',
    aiLevel: 'Stockfish niveau {level}',
  },
  {
    'nav.explorer': 'Explorer',
    'nav.repertoire': 'Repertoire',
    'nav.training': 'Training',
    'nav.import': 'Import',
    'nav.analysis': 'Analysis',
    'nav.data': 'Data',
    loading: 'Loading…',
    langGroup: 'Language / Langue',
    langEn: 'English',
    langFr: 'Français',

    white: 'White',
    black: 'Black',
    both: 'Both',
    whiteRep: 'White repertoire',
    blackRep: 'Black repertoire',

    'speed.ultrabullet': 'UltraBullet',
    'speed.bullet': 'Bullet',
    'speed.blitz': 'Blitz',
    'speed.rapid': 'Rapid',
    'speed.classical': 'Classical',
    'speed.daily': 'Correspondence',

    startPosition: 'Starting position',
    unknownOpening: 'Unnamed opening',
    unlistedOpening: 'Unnamed opening',
    playAMove: 'Play a move on the board.',
    wdlTitle: '{w} wins, {d} draws, {l} losses',
    games_one: '{count} game',
    games_other: '{count} games',
    positions_one: '{count} position',
    positions_other: '{count} positions',
    moves_one: '{count} move',
    moves_other: '{count} moves',
    or: 'or',
    me: 'Me',

    'class.best': 'Best move',
    'class.excellent': 'Excellent',
    'class.good': 'Good',
    'class.inaccuracy': 'Inaccuracy',
    'class.mistake': 'Mistake',
    'class.blunder': 'Blunder',

    engineLoadFailed: 'Could not load Stockfish.',
    engineStopped: 'Engine stopped.',

    saveFailed: 'Could not save: {error}',
    backupInvalid: 'This file is not a Chess Openings Trainer backup.',

    accountNotFound: '{site} account "{user}" not found.',
    rateLimited: '{site} is rate limiting requests: try again in a minute.',
    httpError: '{site} error ({status}).',
    lichessProgress: '{count} games received from Lichess',
    chesscomMonth: 'Chess.com: reading games of {month}',
    chesscomKept: 'Chess.com: {count} games kept',
    anonymous: 'Anonymous',
    aiLevel: 'Stockfish level {level}',
  },
);
