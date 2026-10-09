import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { SITE_LABEL } from '../games/types';
import { locale, useT, type TKey } from '../i18n';
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
import { downloadText, formatDate } from '../lib/util';
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

const UNITS: TKey[] = ['data.unit.kb', 'data.unit.mb', 'data.unit.gb', 'data.unit.tb'];

function formatBytes(n: number, t: ReturnType<typeof useT>): string {
  if (n < 1024) return `${n} ${t('data.unit.b')}`;
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(locale(), { maximumFractionDigits: v < 10 ? 1 : 0 })} ${t(UNITS[i])}`;
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

/** A restore failure: invalid JSON is kept as a flag so the message follows a language switch. */
type RestoreError = { invalidJson: true } | { text: string };

export function DataView() {
  const t = useT();
  const state = useStore();
  const { settings, sources } = state;
  const [storage, setStorage] = useState<StorageInfo>({});
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [restoreError, setRestoreError] = useState<RestoreError | null>(null);
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
    toast(t(ok ? 'data.persistOk' : 'data.persistRefused'), ok ? 'info' : 'error');
    refresh();
  };

  const backup = () => {
    downloadText(`chess-openings-trainer-${today()}.json`, exportBackup(), 'application/json');
    const now = Date.now();
    writeLastBackup(now);
    setLastBackup(now);
    toast(t('data.backupDone'));
  };

  const restore = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setRestoreError(null);
    if (!confirm(t('data.restoreConfirm', { file: file.name }))) return;
    try {
      importBackup(await file.text());
      toast(t('data.restoreDone'));
      refresh();
    } catch (e) {
      setRestoreError(e instanceof SyntaxError ? { invalidJson: true } : { text: (e as Error).message });
    }
  };

  const deleteSource = (id: string, label: string, games: number) => {
    if (!confirm(t('data.deleteConfirm', { count: games, account: label }))) return;
    removeSource(id);
    toast(t('data.accountDeleted', { account: label }));
  };

  const wipe = async () => {
    if (!confirm(t('data.wipeConfirm'))) return;
    if (!confirm(t('data.wipeConfirmLast'))) return;
    try {
      await clearAll();
      writeLastBackup(null);
      setLastBackup(null);
      toast(t('data.wipeDone'));
      refresh();
    } catch (e) {
      toast(t('data.wipeFailed', { error: (e as Error).message }), 'error');
    }
  };

  const hasData = content.white + content.black + content.games > 0;

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t('common.nav.data')}</h2>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>{t('data.storageTitle')}</h3>
          </div>
          <p className="small">{t('data.storageHelp')}</p>
          <dl className="dv-facts">
            <dt>{t('data.used')}</dt>
            <dd>
              {storage.usage !== undefined ? formatBytes(storage.usage, t) : t('data.unknown')}
              {storage.quota ? (
                <span className="muted"> {t('data.quotaOf', { total: formatBytes(storage.quota, t) })}</span>
              ) : null}
            </dd>
            <dt>{t('data.persistent')}</dt>
            <dd>
              {storage.persisted === undefined ? (
                <span className="muted">{t('data.persistUnsupported')}</span>
              ) : storage.persisted ? (
                <span className="tag green">{t('data.persistGranted')}</span>
              ) : (
                <span className="tag yellow">{t('data.persistDenied')}</span>
              )}
            </dd>
          </dl>
          {storage.persisted === false && (
            <>
              <p className="muted small">{t('data.persistHelp')}</p>
              <div className="row">
                <button className="btn small" onClick={askPersistence}>
                  {t('data.persistAsk')}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>{t('data.backupTitle')}</h3>
          </div>
          <p className="small">{t('data.backupHelp')}</p>
          <p className="muted small">
            {t('data.content', {
              white: t('common.moves', { count: content.white }),
              black: t('common.moves', { count: content.black }),
              games: t('data.importedGames', { count: content.games }),
            })}
          </p>
          <p className="small">
            {t('data.lastBackup')}{' '}
            {lastBackup ? formatDate(lastBackup) : <span className="tag yellow">{t('data.lastBackupNever')}</span>}
          </p>
          <div className="row">
            <button className="btn primary" disabled={!hasData} onClick={backup}>
              <Icon name="download" size={16} /> {t('data.backupExport')}
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} /> {t('data.restore')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => restore(e.target.files?.[0])}
            />
          </div>
          {restoreError && (
            <div className="feedback bad">{'text' in restoreError ? restoreError.text : t('data.invalidJson')}</div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="grow">{t('data.accountsTitle')}</h3>
          <button className="btn small" onClick={() => setView('import')}>
            {t('data.importGames')}
          </button>
        </div>
        {sources.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('data.colSite')}</th>
                <th>{t('data.colUser')}</th>
                <th>{t('data.colGames')}</th>
                <th>{t('data.colImported')}</th>
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
                      title={t('data.deleteGames')}
                      aria-label={t('data.deleteGames')}
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
          <p className="muted small">{t('data.noAccounts')}</p>
        )}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3 className="grow">{t('data.settingsTitle')}</h3>
            <button
              className="btn ghost small"
              onClick={() => setSettings({ ...DEFAULT_SETTINGS, side: settings.side, speeds: settings.speeds })}
            >
              {t('data.defaults')}
            </button>
          </div>
          <div className="stack dv-settings">
            <label className="switch">
              <input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ sound: e.target.checked })} />
              {t('data.sound')}
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.engineArrows}
                onChange={(e) => setSettings({ engineArrows: e.target.checked })}
              />
              {t('data.engineArrows')}
            </label>
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.repArrows}
                onChange={(e) => setSettings({ repArrows: e.target.checked })}
              />
              {t('data.repArrows')}
            </label>
            <label className="field">
              <span>
                {t('data.depth')} <strong className="dv-value">{settings.depth}</strong>
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
              <span className="muted small dv-hint">{t('data.depthHelp')}</span>
            </label>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>{t('data.aboutTitle')}</h3>
          </div>
          <p className="small">
            {t('data.license')} {t('data.sourceCode')}{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            .
          </p>
          <p className="small">{t('data.languages')}</p>
          <ul className="dv-credits small">
            <li>
              <a href="https://github.com/lichess-org/chessground" target="_blank" rel="noreferrer">
                chessground
              </a>
              {t('data.credit.chessground')}
            </li>
            <li>
              <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">
                Stockfish.js
              </a>
              {t('data.credit.stockfish')}
            </li>
            <li>
              <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noreferrer">
                chess.js
              </a>
              {t('data.credit.chessjs')}
            </li>
            <li>
              <a href="https://github.com/lichess-org/chess-openings" target="_blank" rel="noreferrer">
                lichess-org/chess-openings
              </a>
              {t('data.credit.openings')}
            </li>
            <li>{t('data.credit.apis')}</li>
          </ul>
        </div>
      </div>

      <div className="panel dv-danger">
        <div className="panel-head">
          <h3>{t('data.dangerTitle')}</h3>
        </div>
        <div className="row">
          <p className="small grow">{t('data.dangerHelp')}</p>
          <button className="btn danger" onClick={wipe}>
            <Icon name="trash" size={16} /> {t('data.wipe')}
          </button>
        </div>
      </div>
    </div>
  );
}
