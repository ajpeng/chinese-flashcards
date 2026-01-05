import React, { useEffect, useState } from 'react';

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

              <p style={{ lineHeight: 1.6 }}>{article.content}</p>

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
