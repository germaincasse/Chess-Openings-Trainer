import { setLang, useLang, useT, type Lang } from '../i18n';

// Same switch as the Umbra and Limes sites: two flags, the active one fully opaque.

function Flag({ lang }: { lang: Lang }) {
  return lang === 'en' ? (
    <svg viewBox="0 0 60 30" aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#FFF" strokeWidth="6" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#C8102E" strokeWidth="2.5" />
      <path d="M30 0v30M0 15h60" stroke="#FFF" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  ) : (
    <svg viewBox="0 0 60 30" aria-hidden="true">
      <rect width="20" height="30" fill="#002654" />
      <rect x="20" width="20" height="30" fill="#FFF" />
      <rect x="40" width="20" height="30" fill="#CE1126" />
    </svg>
  );
}

export function LangSwitch() {
  const t = useT();
  const lang = useLang();
  return (
    <div className="lang-seg" role="group" aria-label={t('common.langGroup')}>
      {(['en', 'fr'] as Lang[]).map((l) => (
        <button
          key={l}
          aria-pressed={lang === l}
          title={t(l === 'en' ? 'common.langEn' : 'common.langFr')}
          aria-label={t(l === 'en' ? 'common.langEn' : 'common.langFr')}
          onClick={() => setLang(l)}
        >
          <Flag lang={l} />
        </button>
      ))}
    </div>
  );
}
