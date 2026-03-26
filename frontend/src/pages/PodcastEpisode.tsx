import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import WordDrawer, { type LookedUpWord } from '../components/WordDrawer';

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

function findActiveCueIndex(cues: SrtCue[], timeMs: number): number {
  for (let i = 0; i < cues.length; i++) {
    if (timeMs >= cues[i].startMs && timeMs <= cues[i].endMs) return i;
  }
  return -1;
}

// Tokenize a Chinese string into clickable spans.
// Each Han character is its own token so every character has a CC-CEDICT entry.
// Non-Han runs (punctuation, spaces, Latin) are grouped as single non-clickable tokens.
function tokenizeZh(text: string): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(ch)) {
      tokens.push(ch);
      i++;
    } else {
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
  const { accessToken: token } = useAuth() as any;

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
  const [showEnglish, setShowEnglish] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Keep refs in sync so keyboard callbacks always see fresh values without stale closures
  const zhCuesRef = useRef<SrtCue[]>([]);
  useEffect(() => { zhCuesRef.current = zhCues; }, [zhCues]);

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
      } else {
        setDrawerWord({ simplified: word, pinyin: '', english: '', hskLevel: null });
      }
    } catch {
      setDrawerWord({ simplified: word, pinyin: '', english: '', hskLevel: null });
    }
    setLookingUp('');
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * duration;
  };

  // Use audioRef directly (not `playing` state) to avoid stale closures in keyboard handler
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play();
    else audioRef.current.pause();
  }, []);

  // ── Subtitle / time navigation ──────────────────────────────────────────────

  const goNextCue = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const cues = zhCuesRef.current;
    if (!cues.length) {
      // No subtitles — skip forward 5s
      audio.currentTime = Math.min(audio.currentTime + 5, audio.duration || audio.currentTime);
      return;
    }
    const ms = audio.currentTime * 1000;
    const nextIdx = cues.findIndex(c => c.startMs > ms);
    if (nextIdx >= 0) audio.currentTime = cues[nextIdx].startMs / 1000;
  }, []);

  const goPrevCue = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const cues = zhCuesRef.current;
    if (!cues.length) {
      // No subtitles — skip back 5s
      audio.currentTime = Math.max(audio.currentTime - 5, 0);
      return;
    }
    const ms = audio.currentTime * 1000;
    const activeIdx = findActiveCueIndex(cues, ms);
    // If we're > 1s into the current cue, replay it; otherwise go to previous
    if (activeIdx >= 0 && ms - cues[activeIdx].startMs > 1000) {
      audio.currentTime = cues[activeIdx].startMs / 1000;
    } else {
      const prevIdx = activeIdx > 0 ? activeIdx - 1 : 0;
      audio.currentTime = cues[prevIdx].startMs / 1000;
    }
  }, []);

  const replayCue = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const cues = zhCuesRef.current;
    if (!cues.length) {
      audio.currentTime = Math.max(audio.currentTime - 5, 0);
      return;
    }
    const ms = audio.currentTime * 1000;
    const activeIdx = findActiveCueIndex(cues, ms);
    if (activeIdx >= 0) {
      audio.currentTime = cues[activeIdx].startMs / 1000;
    } else {
      // Between cues — find the most recent cue
      let prev = 0;
      for (let i = cues.length - 1; i >= 0; i--) {
        if (cues[i].startMs <= ms) { prev = i; break; }
      }
      audio.currentTime = cues[prev].startMs / 1000;
    }
  }, []);

  // ── Keyboard handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); goNextCue(); break;
        case 'ArrowLeft':  e.preventDefault(); goPrevCue(); break;
        case 'ArrowUp':    e.preventDefault(); replayCue(); break;
        case ' ':          e.preventDefault(); togglePlay(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNextCue, goPrevCue, replayCue, togglePlay]);

  if (loading) return <div style={{ padding: 40, color: 'var(--muted-color)' }}>Loading…</div>;
  if (error || !episode) return <div style={{ padding: 40, color: 'rgb(239,68,68)' }}>{error || 'Episode not found.'}</div>;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hasCues = zhCues.length > 0;

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
            cursor: 'pointer', position: 'relative', marginBottom: 20,
          }}
        >
          <div style={{
            height: '100%', borderRadius: 3,
            background: 'rgba(59,130,246,0.85)',
            width: `${progress}%`,
            transition: 'width 0.2s linear',
          }} />
        </div>

        {/* Navigation controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {/* Prev cue / skip back */}
          <button
            onClick={goPrevCue}
            title={hasCues ? 'Previous subtitle (←)' : 'Skip back 5s (←)'}
            style={navBtnStyle}
          >
            {hasCues ? '⏮ Prev' : '−5s'}
          </button>

          {/* Replay cue */}
          <button
            onClick={replayCue}
            title={hasCues ? 'Replay subtitle (↑)' : 'Skip back 5s (↑)'}
            style={{ ...navBtnStyle, background: 'rgba(59,130,246,0.1)', color: 'rgba(59,130,246,0.9)', borderColor: 'rgba(59,130,246,0.25)' }}
          >
            ↩ Replay
          </button>

          {/* Next cue / skip forward */}
          <button
            onClick={goNextCue}
            title={hasCues ? 'Next subtitle (→)' : 'Skip forward 5s (→)'}
            style={navBtnStyle}
          >
            {hasCues ? 'Next ⏭' : '+5s'}
          </button>
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
          No subtitles yet. Click "Generate Subtitles" in the podcast library to get clickable Chinese subtitles.
        </div>
      )}

      {/* Dual subtitle display */}
      {hasCues && (
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--border-color)',
          borderRadius: 12, padding: '20px 24px 24px',
          minHeight: 140,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16,
        }}>
          {/* Toggle English */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowEnglish(v => !v)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                border: '1px solid var(--border-color)',
                background: showEnglish ? 'rgba(59,130,246,0.1)' : 'transparent',
                color: showEnglish ? 'rgba(59,130,246,0.9)' : 'var(--muted-color)',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              EN {showEnglish ? 'on' : 'off'}
            </button>
          </div>
          {/* Chinese subtitle — clickable characters */}
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

          {/* Divider + English subtitle (collapsible) */}
          {showEnglish && (
            <>
              <div style={{ height: 1, background: 'var(--border-light, var(--border-color))', margin: '0 -4px' }} />
              <div style={{ textAlign: 'center', minHeight: 32 }}>
                {activeEn ? (
                  <div style={{ fontSize: 'clamp(14px, 3vw, 18px)', color: 'var(--muted-color)', lineHeight: 1.5 }}>
                    {activeEn.text}
                  </div>
                ) : activeZh ? (
                  <div style={{ color: 'rgba(128,128,128,0.4)', fontSize: 13, fontStyle: 'italic' }}>—</div>
                ) : null}
              </div>
            </>
          )}

          {/* Keyboard hint */}
          <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(128,128,128,0.4)' }}>
            Tap any character for definition · ← prev · ↑ replay · → next · Space play/pause
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

const navBtnStyle: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 8,
  border: '1px solid var(--border-color)',
  background: 'transparent',
  color: 'var(--muted-color)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  userSelect: 'none',
};
