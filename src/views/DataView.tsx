import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { SITE_LABEL } from '../games/types';
import { repStats } from '../repertoire/model';
import { requestPersistence } from '../store/db';
import {
  clearAll,
  DEFAULT_SETTINGS,
  exportBackup,
  importBackup,
  removeSource,
  setSettings,
  setView,
  toast,
  useStore,
} from '../store/store';
import { downloadText, formatDate, plural } from '../lib/util';
import '../styles/data.css';

const REPO_URL = 'https://github.com/germaincasse/Chess-Openings-Trainer';
// Per-browser reminder only, the backup itself is the file.
const LAST_BACKUP_KEY = 'cot-last-backup';

interface StorageInfo {
  usage?: number;
  quota?: number;
  persisted?: boolean;
}

async function readStorage(): Promise<StorageInfo> {
  const info: StorageInfo = {};
  const s = navigator.storage;
  try {
    if (s?.estimate) {
      const e = await s.estimate();
      info.usage = e.usage;
      info.quota = e.quota;
    }
  } catch {
    // Not available (old browser, private mode).
  }
  try {
    if (s?.persisted) info.persisted = await s.persisted();
  } catch {
    // Idem.
  }
  return info;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readLastBackup(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_BACKUP_KEY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeLastBackup(ts: number | null) {
  try {
    if (ts) localStorage.setItem(LAST_BACKUP_KEY, String(ts));
    else localStorage.removeItem(LAST_BACKUP_KEY);
  } catch {
    // Storage blocked: the reminder is optional.
  }
}

export function DataView() {
  const state = useStore();
  const { settings, sources } = state;
  const [storage, setStorage] = useState<StorageInfo>({});
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    void readStorage().then(setStorage);
  };
  useEffect(refresh, []);

  const content = useMemo(() => {
    const white = repStats(state.reps.white);
    const black = repStats(state.reps.black);
    const games = state.sources.reduce((n, s) => n + s.games.length, 0);
    return { white: white.moves, black: black.moves, games };
  }, [state.reps, state.sources, state.repsRev]);

  const askPersistence = async () => {
    const ok = await requestPersistence();
    toast(
      ok ? 'Stockage persistant accordé.' : "Le navigateur n'a pas accordé le stockage persistant pour l'instant.",
      ok ? 'info' : 'error',
    );
    refresh();
  };

  const backup = () => {
    downloadText(`chess-openings-trainer-${today()}.json`, exportBackup(), 'application/json');
    const now = Date.now();
    writeLastBackup(now);
    setLastBackup(now);
    toast('Sauvegarde exportée.');
  };

  const restore = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setRestoreError(null);
    const msg =
      `Restaurer « ${file.name} » ? Les répertoires, la progression, les parties importées ` +
      'et les réglages actuels seront remplacés.';
    if (!confirm(msg)) return;
    try {
      importBackup(await file.text());
      toast('Sauvegarde restaurée.');
      refresh();
    } catch (e) {
      setRestoreError(e instanceof SyntaxError ? "Ce fichier n'est pas un JSON valide." : (e as Error).message);
    }
  };

  const deleteSource = (id: string, label: string, games: number) => {
    const msg = `Supprimer les ${plural(games, 'partie importée', 'parties importées')} de ${label} ? Le répertoire n'est pas modifié.`;
    if (!confirm(msg)) return;
    removeSource(id);
    toast(`Compte ${label} supprimé.`);
  };

  const wipe = async () => {
    const first =
      'Effacer toutes les données de Chess Openings Trainer dans ce navigateur ? ' +
      'Répertoires, progression, parties importées, analyses et réglages seront supprimés.';
    if (!confirm(first)) return;
    if (!confirm('Dernière confirmation : cette action est définitive. Avez-vous exporté une sauvegarde ?')) return;
    try {
      await clearAll();
      writeLastBackup(null);
      setLastBackup(null);
      toast('Toutes les données ont été effacées.');
      refresh();
    } catch (e) {
      toast(`Effacement impossible : ${(e as Error).message}`, 'error');
    }
  };

  const hasData = content.white + content.black + content.games > 0;

  return (
    <div className="page">
      <div className="page-head">
        <h2>Données</h2>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Stockage local</h3>
          </div>
          <p className="small">
            Tout reste dans ce navigateur (IndexedDB) : rien n'est envoyé sur un serveur. En contrepartie, vos données
            disparaissent si vous effacez les données du site, utilisez la navigation privée ou changez de navigateur
            ou d'appareil. Exportez régulièrement une sauvegarde.
          </p>
          <dl className="dv-facts">
            <dt>Espace utilisé</dt>
            <dd>
              {storage.usage !== undefined ? formatBytes(storage.usage) : 'inconnu'}
              {storage.quota ? <span className="muted"> sur {formatBytes(storage.quota)} disponibles</span> : null}
            </dd>
            <dt>Stockage persistant</dt>
            <dd>
              {storage.persisted === undefined ? (
                <span className="muted">non pris en charge</span>
              ) : storage.persisted ? (
                <span className="tag green">accordé</span>
              ) : (
                <span className="tag yellow">non accordé</span>
              )}
            </dd>
          </dl>
          {storage.persisted === false && (
            <>
              <p className="muted small">
                Sans stockage persistant, le navigateur peut effacer les données s'il manque de place. Il décide
                lui-même d'accorder la demande (site en favori, utilisation fréquente...).
              </p>
              <div className="row">
                <button className="btn small" onClick={askPersistence}>
                  Demander le stockage persistant
                </button>
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Sauvegarde</h3>
          </div>
          <p className="small">
            Un fichier JSON contenant les deux répertoires, la progression d'entraînement, les parties importées et
            les réglages.
          </p>
          <p className="muted small">
            Contenu actuel : Blancs {plural(content.white, 'coup')}, Noirs {plural(content.black, 'coup')},{' '}
            {plural(content.games, 'partie importée', 'parties importées')}.
          </p>
          <p className="small">
            Dernière sauvegarde exportée :{' '}
            {lastBackup ? formatDate(lastBackup) : <span className="tag yellow">jamais depuis ce navigateur</span>}
          </p>
          <div className="row">
            <button className="btn primary" disabled={!hasData} onClick={backup}>
              <Icon name="download" size={16} /> Exporter une sauvegarde
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} /> Restaurer
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => restore(e.target.files?.[0])}
            />
          </div>
          {restoreError && <div className="feedback bad">{restoreError}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="grow">Comptes importés</h3>
          <button className="btn small" onClick={() => setView('import')}>
            Importer des parties
          </button>
        </div>
        {sources.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Pseudo</th>
                <th>Parties</th>
                <th>Importé le</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{SITE_LABEL[s.site]}</td>
                  <td>
                    <strong>{s.username}</strong>
                  </td>
                  <td>{s.games.length}</td>
                  <td>{formatDate(s.importedAt)}</td>
                  <td className="dv-actions">
                    <button
                      className="icon-btn small"
                      title="Supprimer ces parties"
                      onClick={() => deleteSource(s.id, `${s.username} (${SITE_LABEL[s.site]})`, s.games.length)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">Aucun compte importé.</p>
        )}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3 className="grow">Réglages</h3>
            <button
              className="btn ghost small"
              onClick={() => setSettings({ ...DEFAULT_SETTINGS, side: settings.side, speeds: settings.speeds })}
            >
              Valeurs par défaut
            </button>
          </div>
          <div className="stack dv-settings">
            <label className="switch">
              <input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })} />
              Sons
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.engineArrows}
                onChange={(e) => setSettings({ engineArrows: e.target.checked })}
              />
              Flèches du moteur
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.repArrows}
                onChange={(e) => setSettings({ repArrows: e.target.checked })}
              />
              Flèches du répertoire
            </label>
            <label className="field">
              <span>
                Profondeur du moteur dans l'explorateur : <strong className="dv-value">{settings.depth}</strong>
              </span>
              <input
                type="range"
                className="dv-range"
                min={12}
                max={30}
                step={1}
                value={settings.depth}
                onChange={(e) => setSettings({ depth: Number(e.target.value) })}
              />
              <span className="muted small dv-hint">
                Plus la profondeur est grande, plus l'évaluation est fiable mais lente. 18 à 22 suffit pour l'ouverture.
              </span>
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>À propos</h3>
          </div>
          <p className="small">
            Chess Openings Trainer est un logiciel libre sous licence GPL-3.0. Code source :{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            .
          </p>
          <ul className="dv-credits small">
            <li>
              <a href="https://github.com/lichess-org/chessground" target="_blank" rel="noreferrer">
                chessground
              </a>{' '}
              (Lichess) : échiquier, GPL-3.0
            </li>
            <li>
              <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">
                Stockfish.js
              </a>{' '}
              (Stockfish 19 lite en WebAssembly) : moteur, GPL-3.0
            </li>
            <li>
              <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noreferrer">
                chess.js
              </a>{' '}
              : règles du jeu, BSD-2-Clause
            </li>
            <li>
              <a href="https://github.com/lichess-org/chess-openings" target="_blank" rel="noreferrer">
                lichess-org/chess-openings
              </a>{' '}
              : noms d'ouvertures, CC0
            </li>
            <li>Parties récupérées depuis votre navigateur via les API publiques de Lichess et Chess.com.</li>
          </ul>
        </div>
      </div>

      <div className="panel dv-danger">
        <div className="panel-head">
          <h3>Zone dangereuse</h3>
        </div>
        <div className="row">
          <p className="small grow">
            Efface définitivement toutes les données de l'application dans ce navigateur. Exportez une sauvegarde
            avant si vous voulez pouvoir revenir en arrière.
          </p>
          <button className="btn danger" onClick={wipe}>
            <Icon name="trash" size={16} /> Tout effacer
          </button>
        </div>
      </div>
    </div>
  );
}
