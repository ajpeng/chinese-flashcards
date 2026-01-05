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

function ArticleContent({ content, words }: { content: string; words: Word[] }) {
  const tokens = useMemo(() => tokenize(content, words), [content, words]);
  return (
    <p style={{ lineHeight: 1.6 }}>
      {tokens.map((t, idx) =>
        t.word ? (
          <span
            key={idx}
            title={`${t.word.pinyin} — ${t.word.english}`}
            data-pinyin={t.word.pinyin}
            data-english={t.word.english}
            style={{ cursor: 'help', background: 'rgba(255, 255, 0, 0.06)' }}
            className="word-token"
            aria-label={`${t.word.simplified}, pinyin ${t.word.pinyin}, ${t.word.english}`}
          >
            {t.text}
          </span>
        ) : (
          <span key={idx}>{t.text}</span>
        )
      )}
    </p>
  );
}

export default function Articles(): React.ReactElement {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Article[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = async () => {
    setLoading(true);
    setError(null);

    try {
      // Relative path so Vite dev server proxy can forward to the backend.
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

              <ArticleContent content={article.content} words={article.words} />

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
                          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 4 }}>HSK</th>
                        </tr>
                      </thead>
                      <tbody>
                        {article.words.map((word) => (
                          <tr key={word.id}>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{word.simplified}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{word.pinyin}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{word.english}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid #f0f0f0' }}>{word.hskLevel}</td>
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
