import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export type SegmentedWord = {
  text: string;
  pinyin?: string;
  english?: string;
  hskLevel?: number;
};

export default function SegmentArticle({
  onNavigateBack,
}: {
  onNavigateBack: () => void;
}): React.ReactElement {
  const [inputText, setInputText] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [hskLevel, setHskLevel] = useState<number>(1);
  const [segmentedResults, setSegmentedResults] = useState<SegmentedWord[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /** ID of the article being enriched in the background, if any */
  const [enrichingArticleId, setEnrichingArticleId] = useState<number | null>(null);
  /** Whether enrichment has finished (used to show a success banner) */
  const [enrichingDone, setEnrichingDone] = useState<boolean>(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || '';
  const { accessToken } = useAuth();

  // ── Polling logic ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (enrichingArticleId === null) return;

    const stopPolling = () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/articles/${enrichingArticleId}/status`);
        if (!res.ok) { stopPolling(); return; }
        const data: { enriching: boolean } = await res.json();
        if (!data.enriching) {
          stopPolling();
          setEnrichingArticleId(null);
          setEnrichingDone(true);
        }
      } catch {
        stopPolling();
      }
    };

    pollIntervalRef.current = setInterval(checkStatus, 2000);
    // Also fire once immediately
    checkStatus();

    return () => stopPolling();
  }, [enrichingArticleId, API_URL]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!inputText.trim()) {
      setError('Please enter some Chinese text');
      return;
    }

    setLoading(true);
    setError(null);
    setSegmentedResults(null);

    try {
      const res = await fetch(`${API_URL}/api/segmentation/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText.trim() }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSegmentedResults(data.segments || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSegmentedResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    if (!inputText.trim()) {
      setError('Please enter some Chinese text');
      return;
    }

    setSaving(true);
    setError(null);
    setEnrichingDone(false);

    try {
      const res = await fetch(`${API_URL}/api/articles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          title: title.trim(),
          content: inputText.trim(),
          hskLevel: hskLevel || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      const data: { id: number; enriching?: boolean } = await res.json();

      // Clear the form
      setInputText('');
      setTitle('');
      setHskLevel(1);
      setSegmentedResults(null);

      if (data.enriching && data.id) {
        // Background enrichment is running — start polling, stay on page briefly
        setEnrichingArticleId(data.id);
      } else {
        // No enrichment needed — navigate back immediately
        onNavigateBack();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setTitle('');
    setHskLevel(1);
    setSegmentedResults(null);
    setError(null);
    setEnrichingDone(false);
    setEnrichingArticleId(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 960, padding: '0 4px' }}>
      <h2>New Article</h2>
      <p>Paste Chinese text below to analyze and optionally save as a new article.</p>

      {/* Error banner */}
      {error && (
        <div style={{ color: 'crimson', marginBottom: 12, padding: 12, border: '1px solid crimson', borderRadius: 4 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Enrichment in-progress banner */}
      {enrichingArticleId !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 16, padding: '12px 16px',
          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 6, color: 'rgb(59,130,246)',
        }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span>
            <strong>Article saved!</strong> Fetching AI definitions for unknown words in the background…
          </span>
        </div>
      )}

      {/* Enrichment done banner */}
      {enrichingDone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 16, padding: '12px 16px',
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 6, color: 'rgb(16,185,129)',
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span>
            <strong>Definitions ready!</strong>{' '}
            <button
              onClick={onNavigateBack}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'inherit', fontWeight: 700, textDecoration: 'underline',
                padding: 0, fontSize: 'inherit',
              }}
            >
              Go to articles
            </button>
          </span>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label htmlFor="chinese-input" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
          Chinese Text
        </label>
        <textarea
          id="chinese-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste Chinese text here (max 10,000 characters)"
          rows={8}
          maxLength={10000}
          style={{
            width: '100%',
            padding: 8,
            fontSize: 16,
            lineHeight: 1.5,
            fontFamily: 'inherit',
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          {inputText.length} / 10,000 characters
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button onClick={handleAnalyze} disabled={loading || !inputText.trim()}>
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {segmentedResults && segmentedResults.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3>Segmentation Results</h3>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: 8 }}>Word</th>
                  <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: 8 }}>Pinyin</th>
                  <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: 8 }}>English</th>
                  <th style={{ textAlign: 'left', borderBottom: '2px solid #ddd', padding: 8 }}>HSK</th>
                </tr>
              </thead>
              <tbody>
                {segmentedResults
                  .filter((seg) => seg.text.trim().length > 0 && (seg.pinyin || seg.english))
                  .map((seg, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{seg.text}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{seg.pinyin || '—'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{seg.english || '—'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #f0f0f0' }}>{seg.hskLevel || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <h3>Save Article</h3>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="article-title" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              Title
            </label>
            <input
              id="article-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter article title"
              style={{
                width: '100%',
                padding: 8,
                fontSize: 16,
                fontFamily: 'inherit',
                border: '1px solid #ccc',
                borderRadius: 4,
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label htmlFor="article-hsk-level" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
              HSK Level (optional)
            </label>
            <select
              id="article-hsk-level"
              value={hskLevel}
              onChange={(e) => setHskLevel(Number(e.target.value))}
              style={{
                padding: 8,
                fontSize: 16,
                fontFamily: 'inherit',
                border: '1px solid #ccc',
                borderRadius: 4,
                maxWidth: '100%',
              }}
            >
              <option value={1}>HSK 1</option>
              <option value={2}>HSK 2</option>
              <option value={3}>HSK 3</option>
              <option value={4}>HSK 4</option>
              <option value={5}>HSK 5</option>
              <option value={6}>HSK 6</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !title.trim() || enrichingArticleId !== null}>
              {saving ? 'Saving…' : 'Save Article'}
            </button>
            <button onClick={handleClear} disabled={saving}>
              Clear
            </button>
          </div>
        </div>
      )}

      {segmentedResults && segmentedResults.length === 0 && (
        <div style={{ padding: 12, backgroundColor: '#f0f0f0', borderRadius: 4 }}>
          No words found in the text.
        </div>
      )}
    </div>
  );
}
