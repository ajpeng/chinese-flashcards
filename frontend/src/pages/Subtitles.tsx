import React, { useState, useEffect } from 'react';

const API_URL = (import.meta as any).env.VITE_API_URL || 'https://api.ajpeng.ca';

const LANGUAGES = [
  { value: 'zh-CN', label: 'Chinese (Simplified) — zh-CN' },
  { value: 'zh-TW', label: 'Chinese (Traditional) — zh-TW' },
  { value: 'en-US', label: 'English — en-US' },
  { value: 'ja-JP', label: 'Japanese — ja-JP' },
  { value: 'ko-KR', label: 'Korean — ko-KR' },
];

export default function Subtitles(): React.ReactElement {
  useEffect(() => {
    document.title = 'Subtitle Generator · Chinese Flashcards';
    return () => { document.title = 'Chinese Flashcards'; };
  }, []);

  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('zh-CN');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState('subtitles.srt');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    // Clean up any previous object URL
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch(`${API_URL}/api/subtitles/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), language }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error ${res.status}`);
      }

      // Extract filename from Content-Disposition header if present
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match) setFilename(match[1]);

      const blob = await res.blob();
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong.');
      setStatus('error');
    }
  };

  const handleReset = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setStatus('idle');
    setErrorMsg('');
    setUrl('');
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'clamp(20px,4vw,26px)', fontWeight: 700, letterSpacing: '-0.02em' }}>
        Subtitle Generator
      </h2>
      <p style={{ color: 'var(--muted-color)', marginBottom: 28, fontSize: 13 }}>
        Paste a YouTube URL and generate an <code>.srt</code> subtitle file using Azure speech recognition — ready to load into asbplayer.
      </p>

      <form onSubmit={handleGenerate}>
        <div style={{
          padding: '20px',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          background: 'var(--card-bg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          {/* URL input */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-color)', marginBottom: 8 }}>
              YouTube URL
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              disabled={status === 'loading'}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary, rgba(128,128,128,0.06))',
                color: 'inherit',
                fontSize: 14,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {/* Language selector */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-color)', marginBottom: 8 }}>
              Spoken Language
            </label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              disabled={status === 'loading'}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-secondary, rgba(128,128,128,0.06))',
                color: 'inherit',
                fontSize: 14,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                cursor: 'pointer',
              }}
            >
              {LANGUAGES.map(l => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={status === 'loading' || !url.trim()}
            style={{
              padding: '11px 20px',
              borderRadius: 8,
              border: 'none',
              background: status === 'loading'
                ? 'rgba(59,130,246,0.4)'
                : 'rgba(59,130,246,0.85)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'background 0.15s',
            }}
          >
            {status === 'loading' ? (
              <>
                <span style={{
                  width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)',
                  borderTopColor: '#fff', borderRadius: '50%',
                  display: 'inline-block', animation: 'spin 0.75s linear infinite',
                }} />
                Generating subtitles…
              </>
            ) : 'Generate .srt'}
          </button>

          {status === 'loading' && (
            <p style={{ fontSize: 12, color: 'var(--muted-color)', textAlign: 'center', margin: 0 }}>
              Downloading audio and transcribing — this may take a minute or two for longer videos.
            </p>
          )}
        </div>
      </form>

      {/* Error state */}
      {status === 'error' && (
        <div style={{
          marginTop: 16,
          padding: '14px 16px',
          borderRadius: 10,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: 'rgb(239,68,68)',
          fontSize: 14,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <span>{errorMsg}</span>
          <button onClick={handleReset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', flexShrink: 0, fontSize: 13 }}>
            Try again
          </button>
        </div>
      )}

      {/* Success state */}
      {status === 'done' && downloadUrl && (
        <div style={{
          marginTop: 16,
          padding: '18px 20px',
          borderRadius: 12,
          border: '1px solid rgba(16,185,129,0.3)',
          background: 'rgba(16,185,129,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Subtitles generated!</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={downloadUrl}
              download={filename}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                background: 'rgba(16,185,129,0.85)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              ⬇ Download {filename}
            </a>
            <button
              onClick={handleReset}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--muted-color)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Generate another
            </button>
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted-color)' }}>
            In asbplayer, open the video then drag-and-drop the <code>.srt</code> file onto the player, or use{' '}
            <strong>Load subtitles</strong> from the asbplayer menu.
          </p>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
