import React, { useEffect, useState, useMemo } from 'react';

export type Word = {
  id: number;
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number;
};

export type Article = {
  id: number;
  title: string;
  content: string;
  hskLevel: number;
  createdAt?: string;
  updatedAt?: string;
  words: Word[];
};

type Token = { text: string; word?: Word };

function buildLookup(words: Word[]) {
  const map = new Map<string, Word>();
  let maxLen = 1;
  for (const w of words) {
    map.set(w.simplified, w);
    maxLen = Math.max(maxLen, w.simplified.length);
  }
  return { map, maxLen };
}

function tokenize(content: string, words: Word[]): Token[] {
  if (!content) return [];
  const { map, maxLen } = buildLookup(words || []);
  const tokens: Token[] = [];
  const isHan = (ch: string) => /[\u4E00-\u9FFF]/.test(ch); // basic CJK check
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (!isHan(ch)) {
      let j = i + 1;
      while (j < content.length && !isHan(content[j])) j++;
      tokens.push({ text: content.slice(i, j) });
      i = j;
      continue;
    }

    let matched: Word | undefined;
    let matchedLen = 0;
    for (let len = Math.min(maxLen, content.length - i); len > 0; len--) {
      const sub = content.substr(i, len);
      const w = map.get(sub);
      if (w) { matched = w; matchedLen = len; break; }
    }

    if (matched) {
      tokens.push({ text: content.substr(i, matchedLen), word: matched });
      i += matchedLen;
    } else {
      tokens.push({ text: ch });
      i++;
    }
  }

  return tokens;
}

function ArticleContent({ content, words, showPinyin = false, onToggle, markingSet, savedSet, learnedSet }: { content: string; words: Word[]; showPinyin?: boolean; onToggle?: (wordId: number) => Promise<boolean>; markingSet?: Set<number>; savedSet?: Set<number>; learnedSet?: Set<number> }) {
  const tokens = useMemo(() => tokenize(content, words), [content, words]);
  return (
    <p style={{ lineHeight: 1.6 }}>
      {tokens.map((t, idx) => {
        const key = t.word ? `w-${t.word.id}-${idx}` : `t-${idx}`;

        if (showPinyin) {
          // When pinyin is shown, render every token as a ruby so the pinyin
          // line stays aligned; and include a popup that contains pinyin + actions
          return (
            <span
              key={key}
              title={t.word ? `${t.word.pinyin} — ${t.word.english}` : undefined}
              data-pinyin={t.word?.pinyin ?? ''}
              data-english={t.word?.english ?? ''}
              style={{ cursor: t.word ? 'help' : 'default', background: t.word ? 'rgba(255, 255, 0, 0.06)' : 'transparent' }}
              className="word-token"
              aria-label={t.word ? `${t.word.simplified}, pinyin ${t.word.pinyin}, ${t.word.english}` : undefined}
              tabIndex={t.word ? 0 : -1}
            >
              <ruby>
                {t.text}
                <rt>{t.word ? t.word.pinyin : '\u00A0'}</rt>
              </ruby>

              {t.word && (
                <div className="token-popup" role="tooltip">
                  <div className="popup-text">
                    <div className="popup-pinyin">{t.word.pinyin}</div>
                    <div className="popup-english">{t.word.english}</div>
                  </div>
                  <div className="popup-actions">
                    {onToggle && (
                      <button
                        type="button"
                        className="save-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await onToggle(t.word!.id);
                        }}
                        disabled={markingSet?.has(t.word.id)}
                        title={learnedSet?.has(t.word.id) ? 'Unlearn word' : 'Save word'}
                      >
                        {learnedSet?.has(t.word.id) ? '★' : '☆'}
                      </button>
                    )}

                    {savedSet?.has(t.word.id) && (
                      <span className="saved-confirm">Saved!</span>
                    )}
                  </div>
                </div>
              )}
            </span>
          );
        }

        // Default (no pinyin shown): render normally with optional popup for actions
        return t.word ? (
          <span
            key={key}
            title={`${t.word.pinyin} — ${t.word.english}`}
            data-pinyin={t.word.pinyin}
            data-english={t.word.english}
            style={{ cursor: 'help', background: 'rgba(255, 255, 0, 0.06)' }}
            className="word-token"
            aria-label={`${t.word.simplified}, pinyin ${t.word.pinyin}, ${t.word.english}`}
            tabIndex={0}
          >
            {t.text}

            {t.word && (
              <div className="token-popup" role="tooltip">
                <div className="popup-text">
                  <div className="popup-pinyin">{t.word.pinyin}</div>
                  <div className="popup-english">{t.word.english}</div>
                </div>
                <div className="popup-actions">
                  {onToggle && (
                    <button
                      type="button"
                      className="save-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await onToggle(t.word!.id);
                      }}
                      disabled={markingSet?.has(t.word.id)}
                      title={learnedSet?.has(t.word.id) ? 'Unlearn word' : 'Save word'}
                      aria-pressed={learnedSet?.has(t.word.id)}
                    >
                      {learnedSet?.has(t.word.id) ? '★' : '☆'}
                    </button>
                  )}

                  {savedSet?.has(t.word.id) && (
                    <span className="saved-confirm">Saved!</span>
                  )}
                </div>
              </div>
            )}
          </span>
        ) : (
          <span key={key}>{t.text}</span>
        );
      })}
    </p>
  );
}

export default function Articles(): React.ReactElement {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Article[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPinyin, setShowPinyin] = useState<boolean>(false);

  // Learned word IDs (synchronized with mock backend) and marking state for in-flight requests
  const [learnedIds, setLearnedIds] = useState<number[]>([]);
  const [markingIds, setMarkingIds] = useState<number[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const learnedSet = useMemo(() => new Set(learnedIds), [learnedIds]);
  const markingSet = useMemo(() => new Set(markingIds), [markingIds]);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  // Fetch initial learned IDs from mock endpoint
  useEffect(() => {
    const fetchLearned = async () => {
      try {
        const res = await fetch('/api/users/mock/flashcards');
        if (!res.ok) return;
        const json = await res.json();
        const ids = Array.isArray(json) ? (json as Array<{ wordId?: number }>).map((r) => r.wordId).filter((n): n is number => typeof n === 'number') : [];
        setLearnedIds(ids);
      } catch (err) {
        console.error('Failed to load learned words', err);
      }
    };

    void fetchLearned();
  }, []);

  const markLearned = async (wordId: number): Promise<boolean> => {
    if (learnedSet.has(wordId) || markingSet.has(wordId)) return false;
    setMarkingIds((s) => [...s, wordId]);

    try {
      const res = await fetch('/api/users/mock/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      setLearnedIds((s) => (s.includes(wordId) ? s : [...s, wordId]));
      return true;
    } catch (err: unknown) {
      console.error('Failed to mark learned', err);
      // Minimal user feedback for now
      alert('Failed to mark word as learned');
      return false;
    } finally {
      setMarkingIds((s) => s.filter((id) => id !== wordId));
    }
  };

  const unlearn = async (wordId: number): Promise<boolean> => {
    if (!learnedSet.has(wordId) || markingSet.has(wordId)) return false;
    setMarkingIds((s) => [...s, wordId]);

    try {
      const res = await fetch('/api/users/mock/flashcards', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      setLearnedIds((s) => s.filter((id) => id !== wordId));
      setSavedIds((s) => s.filter((id) => id !== wordId));
      return true;
    } catch (err: unknown) {
      console.error('Failed to unlearn', err);
      alert('Failed to unlearn word');
      return false;
    } finally {
      setMarkingIds((s) => s.filter((id) => id !== wordId));
    }
  };
  const saveWord = async (wordId: number) => {
    // Call markLearned so the same endpoint is used (and learned state is updated)
    const ok = await markLearned(wordId);
    if (!ok) return false;

    // Show a quick saved confirmation
    setSavedIds((s) => (s.includes(wordId) ? s : [...s, wordId]));
    setTimeout(() => setSavedIds((s) => s.filter((id) => id !== wordId)), 1400);
    return true;
  };

  const toggleLearn = async (wordId: number) => {
    if (learnedSet.has(wordId)) {
      return await unlearn(wordId);
    }
    return await saveWord(wordId);
  };


  const fetchArticles = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/articles');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as Article[];
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchArticles();
  }, []);

  return (
    <div style={{ maxWidth: 960 }}>
      <h2>Articles & Vocabulary</h2>
      <p>
        This page reads articles and their associated vocabulary from the database via the
        <code> /api/articles </code>
        endpoint.
      </p>

      <div style={{ marginBottom: 12 }}>
        <button onClick={fetchArticles} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>{' '}
        <button onClick={() => setShowPinyin((s) => !s)} aria-pressed={showPinyin}>
          Toggle Pinyin
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <div style={{ color: 'crimson', marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && data.length === 0 && !loading && <p>No articles found in the database.</p>}

      {data && data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.map((article) => (
            <article key={article.id} className="card">
              <header style={{ marginBottom: 8 }}>
                <h3 style={{ margin: 0 }}>{article.title}</h3>
                <div className="muted">
                  HSK level: <strong>{article.hskLevel}</strong>
                  {article.createdAt && (
                    <>
                      {' '}
                      · Created:{' '}
                      {new Date(article.createdAt).toLocaleDateString()}
                    </>
                  )}
                </div>
              </header>

              <ArticleContent content={article.content} words={article.words} showPinyin={showPinyin} onToggle={toggleLearn} markingSet={markingSet} savedSet={savedSet} learnedSet={learnedSet} />

              {article.words && article.words.length > 0 && (
                <section style={{ marginTop: 12 }}>
                  <h4 style={{ margin: '8px 0' }}>Vocabulary</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 4 }}>Han Zi</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 4 }}>Pinyin</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 4 }}>English</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 4 }}>HSK</th>                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 4 }}>Action</th>                        </tr>
                      </thead>
                      <tbody>
                        {article.words.map((word) => (
                          <tr key={word.id}>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{word.simplified}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{word.pinyin}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{word.english}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{word.hskLevel}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>
                              <button
                                className="learn-toggle"
                                onClick={() => void (learnedSet.has(word.id) ? unlearn(word.id) : markLearned(word.id))}
                                disabled={markingSet.has(word.id)}
                                aria-pressed={learnedSet.has(word.id)}
                                title={learnedSet.has(word.id) ? 'Unlearn this word' : 'Mark this word as learned'}
                              >
                                {markingSet.has(word.id) ? (learnedSet.has(word.id) ? 'Unlearning…' : 'Marking…') : (learnedSet.has(word.id) ? 'Learned' : 'Mark learned')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
