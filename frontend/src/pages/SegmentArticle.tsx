import React, { useState } from 'react';
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

  const API_URL = import.meta.env.VITE_API_URL || '';
  const { accessToken } = useAuth();

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

      alert('Article saved successfully!');

      // Clear form and navigate back
      setInputText('');
      setTitle('');
      setHskLevel(1);
      setSegmentedResults(null);
      onNavigateBack();
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
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <h2>New Article</h2>
      <p>Paste Chinese text below to analyze and optionally save as a new article.</p>
      {error && (
        <div style={{ color: 'crimson', marginBottom: 12, padding: 12, border: '1px solid crimson', borderRadius: 4 }}>
          <strong>Error:</strong> {error}
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
            <button onClick={handleSave} disabled={saving || !title.trim()}>
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
