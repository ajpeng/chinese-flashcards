import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import HanziWriter from 'hanzi-writer';
import { useAuth } from '../contexts/AuthContext';
import { convertPinyinStyle } from '../utils/pinyin';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.ajpeng.ca';

const HSK_COLORS: Record<number, string> = {
  1: 'rgba(59, 130, 246, 0.8)',
  2: 'rgba(16, 185, 129, 0.8)',
  3: 'rgba(245, 158, 11, 0.8)',
  4: 'rgba(168, 85, 247, 0.8)',
  5: 'rgba(239, 68, 68, 0.8)',
  6: 'rgba(236, 72, 153, 0.8)',
};

type RelatedWord = {
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number;
};

type ExampleSentence = {
  sentence: string;
  pinyin: string;
  english: string;
};

type WordDetailData = {
  word: string;
  pinyin: string | null;
  english: string | null;
  hskLevel: number | null;
  related: RelatedWord[];
  sentences: ExampleSentence[];
};

// ── Drawer types ───────────────────────────────────────────────────────────────

type DrawerWord = {
  id: number; // -1 for lookup-only words
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number | null;
};

// ── StrokeOrder ───────────────────────────────────────────────────────────────

function StrokeOrderChar({
  char,
  color,
  size = 140,
}: {
  char: string;
  color: string;
  size?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);
  const [animating, setAnimating] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    setError(false);
    setAnimating(false);

    try {
      writerRef.current = HanziWriter.create(containerRef.current, char, {
        width: size,
        height: size,
        padding: 8,
        showOutline: true,
        strokeColor: color.replace('0.8)', '1)'),
        outlineColor: 'rgba(150,150,150,0.3)',
        drawingColor: color.replace('0.8)', '1)'),
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 200,
        onLoadCharDataError: () => setError(true),
      });
    } catch {
      setError(true);
    }

    return () => {
      writerRef.current = null;
    };
  }, [char, color, size]);

  const handleAnimate = () => {
    if (!writerRef.current || animating || error) return;
    setAnimating(true);
    writerRef.current.animateCharacter({
      onComplete: () => setAnimating(false),
    });
  };

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.5,
          opacity: 0.3,
          flexShrink: 0,
        }}
      >
        {char}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        ref={containerRef}
        style={{
          width: size,
          height: size,
          cursor: animating ? 'default' : 'pointer',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          overflow: 'hidden',
          flexShrink: 0,
        }}
        onClick={handleAnimate}
        title={animating ? undefined : 'Click to animate stroke order'}
      />
      <button
        onClick={handleAnimate}
        disabled={animating}
        style={{
          background: 'none',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: 12,
          cursor: animating ? 'not-allowed' : 'pointer',
          color: 'var(--muted-color)',
          opacity: animating ? 0.5 : 1,
        }}
      >
        {animating ? 'Animating…' : '▶ Animate'}
      </button>
    </div>
  );
}

// ── Word definition drawer ─────────────────────────────────────────────────────

function WordDrawer({
  word,
  pinyinStyle,
  onClose,
  onSpeak,
}: {
  word: DrawerWord | null;
  pinyinStyle: 'marks' | 'numbers';
  onClose: () => void;
  onSpeak: (text: string) => void;
}) {
  const isOpen = !!word;
  const hskLevel = word?.hskLevel;

  const hskColors: Record<number, { bg: string; text: string; border: string }> = {
    1: { bg: 'rgba(59,130,246,0.12)', text: 'rgb(59,130,246)', border: 'rgba(59,130,246,0.3)' },
    2: { bg: 'rgba(16,185,129,0.12)', text: 'rgb(16,185,129)', border: 'rgba(16,185,129,0.3)' },
    3: { bg: 'rgba(245,158,11,0.12)', text: 'rgb(245,158,11)', border: 'rgba(245,158,11,0.3)' },
    4: { bg: 'rgba(168,85,247,0.12)', text: 'rgb(168,85,247)', border: 'rgba(168,85,247,0.3)' },
    5: { bg: 'rgba(239,68,68,0.12)', text: 'rgb(239,68,68)', border: 'rgba(239,68,68,0.3)' },
    6: { bg: 'rgba(236,72,153,0.12)', text: 'rgb(236,72,153)', border: 'rgba(236,72,153,0.3)' },
  };
  const c = hskLevel ? (hskColors[hskLevel] ?? hskColors[1]) : { bg: 'rgba(128,128,128,0.12)', text: 'rgb(128,128,128)', border: 'rgba(128,128,128,0.3)' };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 299,
            background: 'transparent',
          }}
        />
      )}

      {/* Drawer panel */}
      <div style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 300,
        zIndex: 300,
        background: 'var(--card-bg)',
        borderLeft: '1px solid var(--border-color)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-light)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-color)' }}>
            Definition
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted-color)', lineHeight: 1, padding: '0 2px' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        {word && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Big character + pinyin */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => onSpeak(word.simplified)}
                title="Listen"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1.1, color: c.text }}>
                  {word.simplified}
                </div>
              </button>
              <div style={{ fontSize: 18, color: c.text, fontStyle: 'italic', marginTop: 6, opacity: 0.85 }}>
                {convertPinyinStyle(word.pinyin, pinyinStyle)}
              </div>
              {hskLevel ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  marginTop: 10,
                  padding: '3px 10px', borderRadius: 99,
                  background: c.bg, border: `1px solid ${c.border}`,
                  fontSize: 11, fontWeight: 700, color: c.text, letterSpacing: '0.04em',
                }}>
                  HSK {hskLevel}
                </div>
              ) : (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  marginTop: 10,
                  padding: '3px 10px', borderRadius: 99,
                  background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.25)',
                  fontSize: 11, fontWeight: 700, color: 'var(--muted-color)', letterSpacing: '0.04em',
                }}>
                  Not in HSK
                </div>
              )}
            </div>

            {/* Definition */}
            <div style={{
              background: 'var(--bg-secondary, rgba(128,128,128,0.06))',
              borderRadius: 10, padding: '14px 16px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-color)', marginBottom: 8 }}>
                Meaning
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-color)' }}>
                {word.english}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Word detail page link — always shown */}
              <Link
                to={`/words/${encodeURIComponent(word.simplified)}`}
                onClick={onClose}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '10px 0', borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--muted-color)',
                  fontSize: 13, fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                  boxSizing: 'border-box',
                }}
              >
                Stroke order &amp; examples →
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Clickable sentence text ────────────────────────────────────────────────────

const HAN_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\u20000-\u2A6DF]/;

function ClickableSentence({
  sentence,
  highlight,
  highlightColor,
  onCharClick,
}: {
  sentence: string;
  highlight: string;
  highlightColor: string;
  onCharClick: (char: string) => void;
}) {
  // Split sentence into highlight-match segments and non-match segments,
  // then within each character decide if it's Han (clickable) or not.
  const parts = sentence.split(highlight);

  const renderChars = (text: string, insideHighlight: boolean) =>
    text.split('').map((ch, i) => {
      const isHan = HAN_RE.test(ch);
      return (
        <span
          key={i}
          onClick={isHan ? (e) => { e.stopPropagation(); onCharClick(ch); } : undefined}
          style={{
            cursor: isHan ? 'pointer' : 'default',
            borderRadius: 2,
            padding: isHan ? '0 1px' : undefined,
            background: insideHighlight ? highlightColor : undefined,
            transition: isHan ? 'background 0.12s' : undefined,
          }}
          onMouseEnter={isHan ? (e) => { (e.currentTarget as HTMLSpanElement).style.background = 'rgba(100,160,255,0.25)'; } : undefined}
          onMouseLeave={isHan ? (e) => { (e.currentTarget as HTMLSpanElement).style.background = insideHighlight ? highlightColor : ''; } : undefined}
        >
          {ch}
        </span>
      );
    });

  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {renderChars(part, false)}
          {i < parts.length - 1 && (
            <mark style={{ background: 'transparent', color: 'inherit', padding: 0 }}>
              {renderChars(highlight, true)}
            </mark>
          )}
        </span>
      ))}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WordDetail() {
  const { word } = useParams<{ word: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const pinyinStyle = user?.pinyinStyle ?? 'marks';

  const [data, setData] = useState<WordDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [drawerWord, setDrawerWord] = useState<DrawerWord | null>(null);
  const charLookupCache = useRef<Map<string, DrawerWord | null>>(new Map());

  // TTS state: track which sentence is currently playing
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);

  const decodedWord = word ? decodeURIComponent(word) : '';

  useEffect(() => {
    if (!decodedWord) return;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/words/detail?q=${encodeURIComponent(decodedWord)}`)
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((d: WordDetailData) => setData(d))
      .catch(() => setError('Could not load word details.'))
      .finally(() => setLoading(false));
  }, [decodedWord]);

  const speak = useCallback(async (text: string, idx?: number) => {
    try {
      if (idx !== undefined) setSpeakingIdx(idx);
      const res = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'zh-CN-XiaoxiaoNeural', rate: '0.8' }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const d = await res.json();
      const audio = new Audio(`data:audio/wav;base64,${d.audioData}`);
      audio.onended = () => { if (idx !== undefined) setSpeakingIdx(null); };
      audio.onerror = () => { if (idx !== undefined) setSpeakingIdx(null); };
      audio.play();
    } catch (err) {
      console.error('TTS error:', err);
      if (idx !== undefined) setSpeakingIdx(null);
    }
  }, []);

  const handleCharClick = useCallback(async (char: string) => {
    const cache = charLookupCache.current;
    if (cache.has(char)) {
      const cached = cache.get(char)!;
      if (cached) setDrawerWord(cached);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/words/lookup?q=${encodeURIComponent(char)}`);
      if (!res.ok) { cache.set(char, null); return; }
      const d = await res.json();
      const entry: DrawerWord = {
        id: -1,
        simplified: char,
        pinyin: d.pinyin || '',
        english: d.english || '',
        hskLevel: d.hskLevel || null,
      };
      cache.set(char, entry);
      setDrawerWord(entry);
    } catch { cache.set(char, null); }
  }, []);

  const levelColor = data?.hskLevel ? HSK_COLORS[data.hskLevel] : 'rgba(150,150,150,0.8)';
  const chars = decodedWord.split('').filter(c => /[\u4E00-\u9FFF]/.test(c));
  const highlightBg = levelColor.replace('0.8)', '0.2)');

  return (
    <>
      {/* Word drawer */}
      <WordDrawer
        word={drawerWord}
        pinyinStyle={pinyinStyle}
        onClose={() => setDrawerWord(null)}
        onSpeak={(text) => speak(text)}
      />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px 48px' }}>
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            color: 'inherit',
            fontSize: 14,
            marginTop: 16,
            marginBottom: 24,
          }}
        >
          ← Back
        </button>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted-color)' }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(239,68,68,0.8)' }}>
            {error}
          </div>
        )}

        {data && (
          <>
            {/* ── Hero card ───────────────────────────────────────────────────── */}
            <div
              style={{
                background: 'var(--bg-color, rgba(255,255,255,0.03))',
                border: `1px solid var(--border-color)`,
                borderRadius: 16,
                padding: '28px 24px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                flexWrap: 'wrap',
              }}
            >
              {/* Character */}
              <div style={{ fontSize: 'clamp(56px, 14vw, 80px)', fontWeight: 500, lineHeight: 1, flexShrink: 0 }}>
                {decodedWord}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 160 }}>
                <div
                  style={{
                    fontSize: 'clamp(18px, 5vw, 24px)',
                    color: levelColor,
                    fontStyle: 'italic',
                    marginBottom: 8,
                  }}
                >
                  {data.pinyin ? convertPinyinStyle(data.pinyin, pinyinStyle) : '—'}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 12 }}>
                  {data.english || '—'}
                </div>
                {data.hskLevel && (
                  <span
                    style={{
                      fontSize: 12,
                      padding: '3px 10px',
                      borderRadius: 20,
                      backgroundColor: levelColor.replace('0.8)', '0.15)'),
                      color: levelColor.replace('0.8)', '1)'),
                      fontWeight: 600,
                    }}
                  >
                    HSK {data.hskLevel}
                  </span>
                )}
              </div>
            </div>

            {/* ── Stroke order ────────────────────────────────────────────────── */}
            {chars.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-color)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                  Stroke Order
                </h3>
                <div
                  style={{
                    background: 'var(--bg-color, rgba(255,255,255,0.03))',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                    padding: '20px 16px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 24,
                    justifyContent: chars.length === 1 ? 'center' : 'flex-start',
                  }}
                >
                  {chars.map((char, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      {chars.length > 1 && (
                        <div style={{ fontSize: 13, color: 'var(--muted-color)' }}>{char}</div>
                      )}
                      <StrokeOrderChar char={char} color={levelColor} size={140} />
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: 'var(--muted-color)', marginTop: 8 }}>
                  Click the character or Animate button to see stroke order animation.
                </p>
              </section>
            )}

            {/* ── Example sentences ───────────────────────────────────────────── */}
            {data.sentences.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-color)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                  Example Sentences
                </h3>
                <p style={{ fontSize: 12, color: 'var(--muted-color)', marginTop: -10, marginBottom: 12 }}>
                  Tap any character to see its definition.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.sentences.map((ex, i) => (
                    <div
                      key={i}
                      style={{
                        background: 'var(--bg-color, rgba(255,255,255,0.03))',
                        border: '1px solid var(--border-color)',
                        borderRadius: 10,
                        padding: '12px 14px',
                      }}
                    >
                      {/* Chinese sentence + listen button */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                        <div style={{ fontSize: 16, lineHeight: 1.7, flex: 1 }}>
                          <ClickableSentence
                            sentence={ex.sentence}
                            highlight={decodedWord}
                            highlightColor={highlightBg}
                            onCharClick={handleCharClick}
                          />
                        </div>
                        <button
                          onClick={() => speak(ex.sentence, i)}
                          disabled={speakingIdx === i}
                          title="Listen"
                          style={{
                            background: 'none',
                            border: '1px solid var(--border-color)',
                            borderRadius: 6,
                            padding: '3px 7px',
                            cursor: speakingIdx === i ? 'default' : 'pointer',
                            color: speakingIdx === i ? levelColor : 'var(--muted-color)',
                            fontSize: 14,
                            flexShrink: 0,
                            opacity: speakingIdx === i ? 0.7 : 1,
                            transition: 'color 0.15s',
                            lineHeight: 1,
                          }}
                        >
                          {speakingIdx === i ? '🔊' : '🔈'}
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted-color)', fontStyle: 'italic', marginBottom: 4 }}>
                        {convertPinyinStyle(ex.pinyin, pinyinStyle)}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-color)' }}>
                        {ex.english}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Related words ────────────────────────────────────────────────── */}
            {data.related.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted-color)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                  Related Words
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.related.map(rw => {
                    const rwColor = HSK_COLORS[rw.hskLevel] ?? 'rgba(150,150,150,0.8)';
                    return (
                      <Link
                        key={rw.simplified}
                        to={`/words/${encodeURIComponent(rw.simplified)}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <div
                          style={{
                            background: 'var(--bg-color, rgba(255,255,255,0.03))',
                            border: '1px solid var(--border-color)',
                            borderRadius: 10,
                            padding: '10px 14px',
                            display: 'grid',
                            gridTemplateColumns: 'auto 1fr auto',
                            alignItems: 'center',
                            gap: '0 12px',
                            cursor: 'pointer',
                            transition: 'border-color 0.15s',
                          }}
                          onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = rwColor)}
                          onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)')}
                        >
                          <span style={{ fontSize: 22, fontWeight: 500, color: rwColor }}>
                            {rw.simplified}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: 'var(--muted-color)', fontStyle: 'italic' }}>
                              {convertPinyinStyle(rw.pinyin, pinyinStyle)}
                            </div>
                            <div style={{ fontSize: 13, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {rw.english}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 20,
                              backgroundColor: rwColor.replace('0.8)', '0.15)'),
                              color: rwColor.replace('0.8)', '1)'),
                              whiteSpace: 'nowrap',
                            }}
                          >
                            HSK {rw.hskLevel}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {data.sentences.length === 0 && data.related.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted-color)', padding: '24px 0', fontSize: 14 }}>
                No additional data found for this word.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
