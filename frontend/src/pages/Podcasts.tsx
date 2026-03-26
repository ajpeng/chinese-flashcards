import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.ajpeng.ca';

const SUGGESTED_FEEDS = [
  {
    rssUrl: 'https://feeds.redcircle.com/936a3212-92e5-41c7-b6f9-39e3596adeb8',
    name: 'MandarinCorner',
  },
  {
    rssUrl: 'https://rss.buzzsprout.com/1426696.rss',
    name: 'Mandarin Corner Podcast',
  },
];

type Episode = {
  id: string;
  title: string;
  description: string | null;
  audioUrl: string;
  publishedAt: string | null;
  durationSecs: number | null;
  subtitleStatus: string;
  subtitleError: string | null;
};

type Podcast = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  author: string | null;
  rssUrl: string;
  episodes: Episode[];
};

function formatDuration(secs: number | null): string {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    none: { label: 'No subtitles', color: 'var(--muted-color)', bg: 'rgba(128,128,128,0.1)' },
    processing_zh: { label: 'Transcribing…', color: 'rgb(245,158,11)', bg: 'rgba(245,158,11,0.12)' },
    processing_en: { label: 'Translating…', color: 'rgb(59,130,246)', bg: 'rgba(59,130,246,0.12)' },
    done: { label: 'Subtitles ready', color: 'rgb(16,185,129)', bg: 'rgba(16,185,129,0.12)' },
    failed: { label: 'Failed', color: 'rgb(239,68,68)', bg: 'rgba(239,68,68,0.12)' },
  };
  const s = map[status] ?? map['none'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, color: s.color, background: s.bg,
    }}>
      {s.label}
    </span>
  );
}

export default function Podcasts() {
  const { accessToken: token } = useAuth() as any;
  const navigate = useNavigate();

  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [rssInput, setRssInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [generatingEps, setGeneratingEps] = useState<Set<string>>(new Set());
  const [expandedPodcast, setExpandedPodcast] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/api/podcasts`, { headers, credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPodcasts(data);
        if (data.length > 0 && !expandedPodcast) setExpandedPodcast(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rssInput.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch(`${API_URL}/api/podcasts`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ rssUrl: rssInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || 'Failed to add feed'); return; }
      setRssInput('');
      setPodcasts(prev => {
        const idx = prev.findIndex(p => p.id === data.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = data; return next; }
        return [data, ...prev];
      });
      setExpandedPodcast(data.id);
    } catch {
      setAddError('Network error. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (podcastId: string) => {
    if (!confirm('Remove this podcast and all its episodes?')) return;
    await fetch(`${API_URL}/api/podcasts/${podcastId}`, { method: 'DELETE', headers, credentials: 'include' });
    setPodcasts(prev => prev.filter(p => p.id !== podcastId));
  };

  const handleGenerate = async (podcastId: string, episodeId: string) => {
    setGeneratingEps(s => new Set(s).add(episodeId));
    try {
      const res = await fetch(`${API_URL}/api/podcasts/${podcastId}/episodes/${episodeId}/subtitles`, {
        method: 'POST', headers, credentials: 'include',
      });
      const data = await res.json();

      // Cache hit: server already had subtitles — update immediately, no polling needed
      if (data.subtitleStatus === 'done') {
        setPodcasts(prev => prev.map(p =>
          p.id !== podcastId ? p : {
            ...p,
            episodes: p.episodes.map(e =>
              e.id !== episodeId ? e : { ...e, subtitleStatus: 'done' }
            ),
          }
        ));
        setGeneratingEps(s => { const n = new Set(s); n.delete(episodeId); return n; });
        return;
      }

      // Normal path: optimistic update to processing, then poll
      setPodcasts(prev => prev.map(p =>
        p.id !== podcastId ? p : {
          ...p,
          episodes: p.episodes.map(e =>
            e.id !== episodeId ? e : { ...e, subtitleStatus: 'processing_zh' }
          ),
        }
      ));
      const poll = setInterval(async () => {
        const statusRes = await fetch(
          `${API_URL}/api/podcasts/${podcastId}/episodes/${episodeId}/subtitles/status`,
          { headers, credentials: 'include' }
        );
        const status = await statusRes.json();
        setPodcasts(prev => prev.map(p =>
          p.id !== podcastId ? p : {
            ...p,
            episodes: p.episodes.map(e =>
              e.id !== episodeId ? e : { ...e, subtitleStatus: status.subtitleStatus, subtitleError: status.subtitleError }
            ),
          }
        ));
        if (status.subtitleStatus === 'done' || status.subtitleStatus === 'failed') {
          clearInterval(poll);
          setGeneratingEps(s => { const n = new Set(s); n.delete(episodeId); return n; });
        }
      }, 5000);
    } catch {
      setGeneratingEps(s => { const n = new Set(s); n.delete(episodeId); return n; });
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Podcasts</h1>
      <p style={{ color: 'var(--muted-color)', marginTop: 0, marginBottom: 32 }}>
        Add a Mandarin podcast RSS feed to get dual Chinese/English subtitles and clickable word definitions.
      </p>

      {/* Add feed form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        <input
          type="url"
          placeholder="Podcast RSS feed URL…"
          value={rssInput}
          onChange={e => setRssInput(e.target.value)}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--border-color)',
            background: 'var(--input-bg, var(--card-bg))',
            color: 'var(--text-color)', fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={adding || !rssInput.trim()}
          style={{
            padding: '10px 20px', borderRadius: 8,
            border: 'none', cursor: adding ? 'default' : 'pointer',
            background: 'rgba(59,130,246,0.85)', color: '#fff',
            fontSize: 14, fontWeight: 600,
            opacity: adding || !rssInput.trim() ? 0.6 : 1,
          }}
        >
          {adding ? 'Adding…' : 'Add Feed'}
        </button>
      </form>
      {addError && <p style={{ color: 'rgb(239,68,68)', marginTop: -20, marginBottom: 20, fontSize: 13 }}>{addError}</p>}

      {/* Suggested feeds */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-color)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Suggested Chinese Podcasts
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SUGGESTED_FEEDS.map(feed => {
            const alreadyAdded = podcasts.some(p => p.rssUrl === feed.rssUrl);
            return (
              <button
                key={feed.rssUrl}
                disabled={adding || alreadyAdded}
                onClick={() => { setRssInput(feed.rssUrl); }}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                  border: '1px solid var(--border-color)',
                  background: alreadyAdded ? 'rgba(16,185,129,0.08)' : 'var(--surface-container-low)',
                  color: alreadyAdded ? 'rgb(16,185,129)' : 'var(--text-color)',
                  cursor: alreadyAdded ? 'default' : 'pointer',
                  opacity: adding ? 0.6 : 1,
                }}
              >
                {alreadyAdded ? '✓ ' : '+ '}{feed.name}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <p style={{ color: 'var(--muted-color)' }}>Loading…</p>}

      {!loading && podcasts.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          border: '2px dashed var(--border-color)', borderRadius: 12,
          color: 'var(--muted-color)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎙</div>
          <p style={{ fontSize: 15 }}>No podcasts yet. Add a Mandarin podcast RSS feed above to get started.</p>
        </div>
      )}

      {/* Podcast list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {podcasts.map(podcast => (
          <div key={podcast.id} style={{
            border: '1px solid var(--border-color)',
            borderRadius: 12, overflow: 'hidden',
            background: 'var(--card-bg)',
          }}>
            {/* Podcast header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                cursor: 'pointer',
                borderBottom: expandedPodcast === podcast.id ? '1px solid var(--border-color)' : 'none',
              }}
              onClick={() => setExpandedPodcast(expandedPodcast === podcast.id ? null : podcast.id)}
            >
              {podcast.imageUrl && (
                <img
                  src={podcast.imageUrl} alt=""
                  style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {podcast.title}
                </div>
                {podcast.author && (
                  <div style={{ color: 'var(--muted-color)', fontSize: 13 }}>{podcast.author}</div>
                )}
                <div style={{ color: 'var(--muted-color)', fontSize: 12, marginTop: 2 }}>
                  {podcast.episodes.length} episode{podcast.episodes.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(podcast.id); }}
                  style={{
                    border: '1px solid var(--border-color)', background: 'transparent',
                    color: 'var(--muted-color)', borderRadius: 6, padding: '5px 10px',
                    cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Remove
                </button>
                <span style={{ color: 'var(--muted-color)', fontSize: 18, userSelect: 'none' }}>
                  {expandedPodcast === podcast.id ? '▲' : '▼'}
                </span>
              </div>
            </div>

            {/* Episode list */}
            {expandedPodcast === podcast.id && (
              <div>
                {podcast.episodes.length === 0 && (
                  <p style={{ padding: '20px', color: 'var(--muted-color)', fontSize: 14 }}>No episodes found in feed.</p>
                )}
                {podcast.episodes.map((ep, i) => (
                  <div
                    key={ep.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '14px 20px',
                      borderBottom: i < podcast.episodes.length - 1 ? '1px solid var(--border-light, var(--border-color))' : 'none',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ep.title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <StatusBadge status={ep.subtitleStatus} />
                        {ep.publishedAt && (
                          <span style={{ color: 'var(--muted-color)', fontSize: 12 }}>{formatDate(ep.publishedAt)}</span>
                        )}
                        {ep.durationSecs && (
                          <span style={{ color: 'var(--muted-color)', fontSize: 12 }}>{formatDuration(ep.durationSecs)}</span>
                        )}
                      </div>
                      {ep.subtitleError && (
                        <div style={{ color: 'rgb(239,68,68)', fontSize: 12, marginTop: 4 }}>Error: {ep.subtitleError}</div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                      {(ep.subtitleStatus === 'none' || ep.subtitleStatus === 'failed') && (
                        <button
                          onClick={() => handleGenerate(podcast.id, ep.id)}
                          disabled={generatingEps.has(ep.id)}
                          style={{
                            padding: '6px 12px', borderRadius: 6, border: 'none',
                            background: 'rgba(168,85,247,0.85)', color: '#fff',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            opacity: generatingEps.has(ep.id) ? 0.6 : 1,
                          }}
                        >
                          Generate Subtitles
                        </button>
                      )}
                      {(ep.subtitleStatus === 'processing_zh' || ep.subtitleStatus === 'processing_en') && (
                        <span style={{ fontSize: 13, color: 'var(--muted-color)', fontStyle: 'italic' }}>
                          {ep.subtitleStatus === 'processing_zh' ? 'Transcribing…' : 'Translating…'}
                        </span>
                      )}
                      <button
                        onClick={() => navigate(`/podcasts/${podcast.id}/episodes/${ep.id}`)}
                        style={{
                          padding: '6px 14px', borderRadius: 6, border: 'none',
                          background: 'rgba(16,185,129,0.85)', color: '#fff',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Play ▶
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
