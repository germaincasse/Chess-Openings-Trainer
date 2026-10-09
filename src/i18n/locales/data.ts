import { defineDict } from '../define';

export default defineDict(
  {
    // sizes
    'unit.b': 'o',
    'unit.kb': 'Ko',
    'unit.mb': 'Mo',
    'unit.gb': 'Go',
    'unit.tb': 'To',

    // local storage
    storageTitle: 'Stockage local',
    storageHelp:
      "Tout reste dans ce navigateur (IndexedDB) : rien n'est envoyé sur un serveur. En contrepartie, vos données " +
      "disparaissent si vous effacez les données du site, utilisez la navigation privée ou changez de navigateur ou d'appareil. " +
      'Exportez régulièrement une sauvegarde.',
    used: 'Espace utilisé',
    unknown: 'inconnu',
    quotaOf: 'sur {total} disponibles',
    persistent: 'Stockage persistant',
    persistUnsupported: 'non pris en charge',
    persistGranted: 'accordé',
    persistDenied: 'non accordé',
    persistHelp:
      "Sans stockage persistant, le navigateur peut effacer les données s'il manque de place. Il décide lui-même " +
      "d'accorder la demande (site en favori, utilisation fréquente...).",
    persistAsk: 'Demander le stockage persistant',
    persistOk: 'Stockage persistant accordé.',
    persistRefused: "Le navigateur n'a pas accordé le stockage persistant pour l'instant.",

    // backup
    backupTitle: 'Sauvegarde',
    backupHelp:
      "Un fichier JSON contenant les deux répertoires, la progression d'entraînement, les parties importées et les réglages.",
    content: 'Contenu actuel : Blancs {white}, Noirs {black}, {games}.',
    importedGames_one: '{count} partie importée',
    importedGames_other: '{count} parties importées',
    lastBackup: 'Dernière sauvegarde exportée :',
    lastBackupNever: 'jamais depuis ce navigateur',
    backupExport: 'Exporter une sauvegarde',
    restore: 'Restaurer',
    backupDone: 'Sauvegarde exportée.',
    restoreConfirm:
      'Restaurer « {file} » ? Les répertoires, la progression, les parties importées et les réglages actuels seront remplacés.',
    restoreDone: 'Sauvegarde restaurée.',
    invalidJson: "Ce fichier n'est pas un JSON valide.",

    // imported accounts
    accountsTitle: 'Comptes importés',
    importGames: 'Importer des parties',
    colSite: 'Site',
    colUser: 'Pseudo',
    colGames: 'Parties',
    colImported: 'Importé le',
    deleteGames: 'Supprimer ces parties',
    deleteConfirm_one: "Supprimer {count} partie importée de {account} ? Le répertoire n'est pas modifié.",
    deleteConfirm_other: "Supprimer les {count} parties importées de {account} ? Le répertoire n'est pas modifié.",
    accountDeleted: 'Compte {account} supprimé.',
    noAccounts: 'Aucun compte importé.',

    // settings
    settingsTitle: 'Réglages',
    defaults: 'Valeurs par défaut',
    sound: 'Sons',
    engineArrows: 'Flèches du moteur',
    repArrows: 'Flèches du répertoire',
    depth: "Profondeur du moteur dans l'explorateur :",
    depthHelp:
      "Plus la profondeur est grande, plus l'évaluation est fiable mais lente. 18 à 22 suffit pour l'ouverture.",

    // about
    aboutTitle: 'À propos',
    license: 'Chess Openings Trainer est un logiciel libre sous licence GPL-3.0.',
    sourceCode: 'Code source :',
    languages: 'Interface disponible en français et en anglais.',
    'credit.chessground': ' (Lichess) : échiquier, GPL-3.0',
    'credit.stockfish': ' (Stockfish 19 lite en WebAssembly) : moteur, GPL-3.0',
    'credit.chessjs': ' : règles du jeu, BSD-2-Clause',
    'credit.openings': " : noms d'ouvertures, CC0",
    'credit.apis': 'Parties récupérées depuis votre navigateur via les API publiques de Lichess et Chess.com.',

    // danger zone
    dangerTitle: 'Zone dangereuse',
    dangerHelp:
      "Efface définitivement toutes les données de l'application dans ce navigateur. Exportez une sauvegarde avant si " +
      'vous voulez pouvoir revenir en arrière.',
    wipe: 'Tout effacer',
    wipeConfirm:
      'Effacer toutes les données de Chess Openings Trainer dans ce navigateur ? ' +
      'Répertoires, progression, parties importées, analyses et réglages seront supprimés.',
    wipeConfirmLast: 'Dernière confirmation : cette action est définitive. Avez-vous exporté une sauvegarde ?',
    wipeDone: 'Toutes les données ont été effacées.',
    wipeFailed: 'Effacement impossible : {error}',
  },
  {
    'unit.b': 'B',
    'unit.kb': 'KB',
    'unit.mb': 'MB',
    'unit.gb': 'GB',
    'unit.tb': 'TB',

    storageTitle: 'Local storage',
    storageHelp:
      'Everything stays in this browser (IndexedDB): nothing is sent to a server. The flip side is that your data ' +
      'disappears if you clear the site data, use private browsing or switch to another browser or device. ' +
      'Export a backup regularly.',
    used: 'Space used',
    unknown: 'unknown',
    quotaOf: 'of {total} available',
    persistent: 'Persistent storage',
    persistUnsupported: 'not supported',
    persistGranted: 'granted',
    persistDenied: 'not granted',
    persistHelp:
      'Without persistent storage, the browser may erase the data when it runs short of space. It decides on its own ' +
      'whether to grant the request (bookmarked site, frequent use...).',
    persistAsk: 'Request persistent storage',
    persistOk: 'Persistent storage granted.',
    persistRefused: 'The browser has not granted persistent storage for now.',

    backupTitle: 'Backup',
    backupHelp: 'A JSON file holding both repertoires, training progress, imported games and settings.',
    content: 'Current content: White {white}, Black {black}, {games}.',
    importedGames_one: '{count} imported game',
    importedGames_other: '{count} imported games',
    lastBackup: 'Last backup exported:',
    lastBackupNever: 'never from this browser',
    backupExport: 'Export a backup',
    restore: 'Restore',
    backupDone: 'Backup exported.',
    restoreConfirm:
      'Restore "{file}"? The current repertoires, training progress, imported games and settings will be replaced.',
    restoreDone: 'Backup restored.',
    invalidJson: 'This file is not valid JSON.',

    accountsTitle: 'Imported accounts',
    importGames: 'Import games',
    colSite: 'Site',
    colUser: 'Username',
    colGames: 'Games',
    colImported: 'Imported on',
    deleteGames: 'Delete these games',
    deleteConfirm_one: 'Delete the {count} imported game from {account}? The repertoire is not changed.',
    deleteConfirm_other: 'Delete the {count} imported games from {account}? The repertoire is not changed.',
    accountDeleted: 'Account {account} removed.',
    noAccounts: 'No imported accounts.',

    settingsTitle: 'Settings',
    defaults: 'Restore defaults',
    sound: 'Sounds',
    engineArrows: 'Engine arrows',
    repArrows: 'Repertoire arrows',
    depth: 'Engine depth in the explorer:',
    depthHelp: 'The higher the depth, the more reliable but slower the evaluation. 18 to 22 is enough for openings.',

    aboutTitle: 'About',
    license: 'Chess Openings Trainer is free software licensed under the GPL-3.0.',
    sourceCode: 'Source code:',
    languages: 'Interface available in English and French.',
    'credit.chessground': ' (Lichess): board, GPL-3.0',
    'credit.stockfish': ' (Stockfish 19 lite in WebAssembly): engine, GPL-3.0',
    'credit.chessjs': ': game rules, BSD-2-Clause',
    'credit.openings': ': opening names, CC0',
    'credit.apis': 'Games are fetched straight from your browser through the public Lichess and Chess.com APIs.',

    dangerTitle: 'Danger zone',
    dangerHelp:
      "Permanently erases all of the app's data in this browser. Export a backup first if you want to be able to go back.",
    wipe: 'Erase everything',
    wipeConfirm:
      'Erase all Chess Openings Trainer data in this browser? ' +
      'Repertoires, progress, imported games, analyses and settings will be deleted.',
    wipeConfirmLast: 'Last confirmation: this cannot be undone. Have you exported a backup?',
    wipeDone: 'All data has been erased.',
    wipeFailed: 'Could not erase the data: {error}',
  },
);
