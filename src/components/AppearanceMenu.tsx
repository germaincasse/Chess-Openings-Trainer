import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { playMoveSound } from '../lib/sound';
import { setSettings, useStore } from '../store/store';
import { BOARD_THEMES, PIECE_SETS, boardTheme, pieceSet, pieceUrl, type BoardTheme } from '../theme/themes';
import '../styles/appearance.css';

const MARGIN = 8;
const MAX_WIDTH = 340;

const squares = (th: BoardTheme) => ({ '--sw-light': th.light, '--sw-dark': th.dark }) as CSSProperties;

/** Top bar button opening a popover: board colours, piece set and move sounds, applied at once. */
export function AppearanceMenu() {
  const t = useT();
  const { settings } = useStore();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  // Fixed position under the button, kept inside the viewport (phones included).
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vw = document.documentElement.clientWidth;
    const width = Math.min(MAX_WIDTH, vw - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(r.right - width, vw - width - MARGIN));
    const top = r.bottom + 6;
    setPos({ top, left, width, maxHeight: Math.max(160, window.innerHeight - top - MARGIN) });
  }, []);

  useEffect(() => {
    if (!open) return;
    pop.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!pop.current?.contains(target) && !btn.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btn.current?.focus();
    };
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) place();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

  const toggle = () => {
    if (!open) place();
    setOpen(!open);
  };

  const theme = boardTheme(settings.boardTheme);
  const set = pieceSet(settings.pieceSet);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`icon-btn appearance-btn${open ? ' active' : ''}`}
        title={t('appearance.open')}
        aria-label={t('appearance.open')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.9 2-2 0-.6-.2-1-.5-1.4-.3-.3-.5-.8-.5-1.3 0-1.1.9-1.8 2-1.8h2.2a3.8 3.8 0 0 0 3.8-3.8C21 6.4 17 3 12 3z" />
          <circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="10" cy="7" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="7" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="appearance-pop" role="dialog" aria-label={t('appearance.title')} tabIndex={-1} style={pos}>
            <section className="ap-section">
              <div className="panel-title">{t('appearance.board')}</div>
              <div className="ap-grid">
                {BOARD_THEMES.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    className={`ap-option${th.id === theme.id ? ' active' : ''}`}
                    aria-pressed={th.id === theme.id}
                    onClick={() => setSettings({ boardTheme: th.id })}
                  >
                    <span className="ap-swatch" style={squares(th)} />
                    <span className="ap-label">{t(th.name)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="ap-section">
              <div className="panel-title">{t('appearance.pieces')}</div>
              <div className="ap-grid">
                {PIECE_SETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`ap-option${p.id === set.id ? ' active' : ''}`}
                    aria-pressed={p.id === set.id}
                    title={t('appearance.pieceCredit', { name: p.name, author: p.author, license: p.license })}
                    onClick={() => setSettings({ pieceSet: p.id })}
                  >
                    <span className="ap-pieces" style={squares(theme)}>
                      <img src={pieceUrl(p.id, 'wN')} alt="" draggable={false} />
                      <img src={pieceUrl(p.id, 'bQ')} alt="" draggable={false} />
                    </span>
                    <span className="ap-label">{p.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <label className="switch ap-sound">
              <input
                type="checkbox"
                checked={settings.sound}
                onChange={(e) => {
                  setSettings({ sound: e.target.checked });
                  if (e.target.checked) playMoveSound('move');
                }}
              />
              {t('appearance.sound')}
            </label>
          </div>,
          document.body,
        )}
    </>
  );
}
