import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import WordDrawer, { LookedUpWord } from '../components/WordDrawer';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.ajpeng.ca';

type SrtCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};

type Episode = {
  id: string;
  title: string;
  description: string | null;
  audioUrl: string;
  subtitleStatus: string;
  subtitleError: string | null;
  zhSrtContent: string | null;
  enSrtContent: string | null;
  podcast: { id: string; title: string; imageUrl: string | null };
};

// Parse SRT string into cue array
function parseSrt(srt: string): SrtCue[] {
  if (!srt) return [];
  const cues: SrtCue[] = [];
  const blocks = srt.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const tsIdx = lines.findIndex(l => l.includes(' --> '));
    if (tsIdx === -1) continue;
    const index = parseInt(lines[tsIdx - 1] || '0', 10);
    const [startStr, endStr] = lines[tsIdx].split(' --> ');
    const text = lines.slice(tsIdx + 1).join(' ').trim();
    if (!text) continue;
    cues.push({ index, startMs: srtToMs(startStr.trim()), endMs: srtToMs(endStr.trim()), text });
  }
  return cues;
}

function srtToMs(ts: string): number {
  const [hms, ms] = ts.split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3_600_000 + m * 60_000 + s * 1_000 + Number(ms);
}

function findActiveCue(cues: SrtCue[], timeMs: number): SrtCue | null {
  for (const cue of cues) {
    if (timeMs >= cue.startMs && timeMs <= cue.endMs) return cue;
  }
  return null;
}

// Tokenize a Chinese string into clickable spans
function tokenizeZh(text: string): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(ch)) {
      // Try to grab up to 4 chars as one token (simple greedy)
      let len = Math.min(4, text.length - i);
      while (len > 1 && !/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text[i + len - 1])) len--;
      tokens.push(text.substr(i, len));
      i += len;
    } else {
      // Non-Chinese: grab until next Han char
      let j = i + 1;
      while (j < text.length && !/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text[j])) j++;
      tokens.push(text.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function isHan(s: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(s);
}

function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PodcastEpisode() {
  const { podcastId, episodeId } = useParams<{ podcastId: string; episodeId: string }>();
  const { token } = useAuth() as any;

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [zhCues, setZhCues] = useState<SrtCue[]>([]);
  const [enCues, setEnCues] = useState<SrtCue[]>([]);
  const [activeZh, setActiveZh] = useState<SrtCue | null>(null);
  const [activeEn, setActiveEn] = useState<SrtCue | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [drawerWord, setDrawerWord] = useState<LookedUpWord | null>(null);
  const [lookingUp, setLookingUp] = useState('');

  const [pollingStatus, setPollingStatus] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const loadEpisode = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/podcasts/${podcastId}/episodes/${episodeId}`, {
        headers, credentials: 'include',
      });
      if (!res.ok) { setError('Episode not found.'); return; }
      const data: Episode = await res.json();
      setEpisode(data);
      if (data.zhSrtContent) setZhCues(parseSrt(data.zhSrtContent));
      if (data.enSrtContent) setEnCues(parseSrt(data.enSrtContent));
    } catch {
      setError('Failed to load episode.');
    } finally {
      setLoading(false);
    }
  }, [podcastId, episodeId]);

  useEffect(() => { loadEpisode(); }, [loadEpisode]);

  // Poll if subtitle generation is in progress
  useEffect(() => {
    if (!episode) return;
    const inProgress = episode.subtitleStatus === 'processing_zh' || episode.subtitleStatus === 'processing_en';
    if (!inProgress || pollingStatus) return;

    setPollingStatus(true);
    const interval = setInterval(async () => {
      const res = await fetch(
        `${API_URL}/api/podcasts/${podcastId}/episodes/${episodeId}/subtitles/status`,
        { headers, credentials: 'include' }
      );
      const status = await res.json();
      setEpisode(prev => prev ? { ...prev, subtitleStatus: status.subtitleStatus, subtitleError: status.subtitleError } : prev);

      if (status.subtitleStatus === 'done') {
        if (status.zhSrtContent) setZhCues(parseSrt(status.zhSrtContent));
        if (status.enSrtContent) setEnCues(parseSrt(status.enSrtContent));
        clearInterval(interval);
        setPollingStatus(false);
      } else if (status.subtitleStatus === 'failed') {
        clearInterval(interval);
        setPollingStatus(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [episode?.subtitleStatus]);

  // Sync subtitles to audio time
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const ms = audioRef.current.currentTime * 1000;
    setCurrentTime(audioRef.current.currentTime);
    setActiveZh(findActiveCue(zhCues, ms));
    setActiveEn(findActiveCue(enCues, ms));
  };

  const handleWordClick = async (word: string) => {
    if (lookingUp === word) return;
    setLookingUp(word);
    try {
      const res = await fetch(`${API_URL}/api/words/lookup?q=${encodeURIComponent(word)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setDrawerWord({
          simplified: data.simplified || word,
          pinyin: data.pinyin || '',
          english: data.english || '',
          hskLevel: data.hskLevel ?? null,
        });
      }
    } catch {}
    setLookingUp('');
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  if (loading) return <div style={{ padding: 40, color: 'var(--muted-color)' }}>Loading…</div>;
  if (error || !episode) return <div style={{ padding: 40, color: 'rgb(239,68,68)' }}>{error || 'Episode not found.'}</div>;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px 80px' }}>
      {/* Back link */}
      <Link
        to="/podcasts"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted-color)', textDecoration: 'none', marginBottom: 20 }}
      >
        ← Back to Podcasts
      </Link>

      {/* Podcast + episode info */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 24 }}>
        {episode.podcast.imageUrl && (
          <img src={episode.podcast.imageUrl} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--muted-color)', marginBottom: 4 }}>{episode.podcast.title}</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{episode.title}</h1>
        </div>
      </div>

      {/* Audio player */}
      <div style={{
        background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 12,
        padding: '20px 24px', marginBottom: 24,
      }}>
        <audio
          ref={audioRef}
          src={episode.audioUrl}
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={() => setDuration(audioRef.current?.duration ?? 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        {/* Play button + times */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <button
            onClick={togglePlay}
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none',
              background: 'rgba(59,130,246,0.85)', color: '#fff',
              fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--muted-color)', fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Scrubber */}
        <div
          onClick={seek}
          style={{
            height: 6, borderRadius: 3, background: 'var(--border-color)',
            cursor: 'pointer', position: 'relative',
          }}
        >
          <div style={{
            height: '100%', borderRadius: 3,
            background: 'rgba(59,130,246,0.85)',
            width: `${progress}%`,
            transition: 'width 0.2s linear',
          }} />
        </div>
      </div>

      {/* Subtitle status banner */}
      {(episode.subtitleStatus === 'processing_zh' || episode.subtitleStatus === 'processing_en') && (
        <div style={{
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: 'rgb(245,158,11)',
        }}>
          {episode.subtitleStatus === 'processing_zh'
            ? '🎙 Transcribing audio with Whisper…'
            : '🌐 Translating subtitles to English…'}
          {' '}This may take a few minutes.
        </div>
      )}
      {episode.subtitleStatus === 'failed' && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: 'rgb(239,68,68)',
        }}>
          Subtitle generation failed: {episode.subtitleError}
        </div>
      )}
      {episode.subtitleStatus === 'none' && (
        <div style={{
          background: 'rgba(128,128,128,0.06)', border: '1px solid var(--border-color)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          fontSize: 13, color: 'var(--muted-color)',
        }}>
          No subtitles yet. Go back to the podcast library and click "Generate Subtitles" for this episode.
        </div>
      )}

      {/* Dual subtitle display */}
      {zhCues.length > 0 && (
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--border-color)',
          borderRadius: 12, padding: '28px 24px',
          minHeight: 140,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16,
        }}>
          {/* Chinese subtitle — clickable words */}
          <div style={{ textAlign: 'center', minHeight: 48 }}>
            {activeZh ? (
              <div style={{ fontSize: 'clamp(22px, 5vw, 30px)', lineHeight: 1.5, letterSpacing: '0.03em' }}>
                {tokenizeZh(activeZh.text).map((tok, i) =>
                  isHan(tok) ? (
                    <span
                      key={i}
                      onClick={() => handleWordClick(tok)}
                      style={{
                        cursor: lookingUp === tok ? 'wait' : 'pointer',
                        borderBottom: '1px dotted rgba(150,150,150,0.5)',
                        borderRadius: 2,
                        padding: '0 1px',
                        transition: 'background 0.1s',
                        background: lookingUp === tok ? 'rgba(59,130,246,0.15)' : 'transparent',
                      }}
                    >
                      {tok}
                    </span>
                  ) : (
                    <span key={i}>{tok}</span>
                  )
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--muted-color)', fontSize: 14, fontStyle: 'italic' }}>
                {playing ? '…' : 'Press play to start'}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-light, var(--border-color))', margin: '0 -4px' }} />

          {/* English subtitle */}
          <div style={{ textAlign: 'center', minHeight: 32 }}>
            {activeEn ? (
              <div style={{ fontSize: 'clamp(14px, 3vw, 18px)', color: 'var(--muted-color)', lineHeight: 1.5 }}>
                {activeEn.text}
              </div>
            ) : activeZh ? (
              <div style={{ color: 'rgba(128,128,128,0.4)', fontSize: 13, fontStyle: 'italic' }}>—</div>
            ) : null}
          </div>

          {/* Hint */}
          <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(128,128,128,0.4)' }}>
            Tap any Chinese word for definition
          </div>
        </div>
      )}

      {/* Word definition drawer */}
      <WordDrawer
        word={drawerWord}
        onClose={() => setDrawerWord(null)}
      />
    </div>
  );
}
