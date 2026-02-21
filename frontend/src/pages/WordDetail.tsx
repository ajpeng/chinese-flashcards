import { useState, useEffect, useRef } from 'react';
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WordDetail() {
  const { word } = useParams<{ word: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const pinyinStyle = user?.pinyinStyle ?? 'marks';

  const [data, setData] = useState<WordDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const levelColor = data?.hskLevel ? HSK_COLORS[data.hskLevel] : 'rgba(150,150,150,0.8)';
  const chars = decodedWord.split('').filter(c => /[\u4E00-\u9FFF]/.test(c));

  // Highlight the queried word inside a sentence
  const highlightWord = (sentence: string, target: string) => {
    const parts = sentence.split(target);
    return parts.map((part, i) => (
      <span key={i}>
        {part}
        {i < parts.length - 1 && (
          <mark
            style={{
              background: levelColor.replace('0.8)', '0.2)'),
              color: 'inherit',
              borderRadius: 3,
              padding: '0 2px',
            }}
          >
            {target}
          </mark>
        )}
      </span>
    ));
  };

  return (
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
                    <div style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 4 }}>
                      {highlightWord(ex.sentence, decodedWord)}
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
  );
}
