import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { convertPinyinStyle } from '../utils/pinyin';

const API_URL = 'https://api.ajpeng.ca';

// ─── Types ───────────────────────────────────────────────────────────────────

type DeckStats = {
  level: number;
  totalWords: number;
  studiedCards: number;
  dueCards: number;
};

type StudyCard = {
  flashcardId: string | null;
  wordId: number;
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number;
  interval: number;
  repetitions: number;
  easeFactor: number;
  isNew: boolean;
};

type View = 'decks' | 'study';
type CardFace = 'front' | 'back' | 'done';

const HSK_COLORS: Record<number, string> = {
  1: 'rgba(59, 130, 246, 0.8)',
  2: 'rgba(16, 185, 129, 0.8)',
  3: 'rgba(245, 158, 11, 0.8)',
  4: 'rgba(168, 85, 247, 0.8)',
  5: 'rgba(239, 68, 68, 0.8)',
  6: 'rgba(236, 72, 153, 0.8)',
};

const HSK_LABELS: Record<number, string> = {
  1: 'Beginner',
  2: 'Elementary',
  3: 'Intermediate',
  4: 'Upper Intermediate',
  5: 'Advanced',
  6: 'Proficient',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Flashcards() {
  const { user, accessToken, loading, loginWithPatreon } = useAuth();
  const pinyinStyle = user?.pinyinStyle ?? 'marks';

  // Deck selection
  const [view, setView] = useState<View>('decks');
  const [decks, setDecks] = useState<DeckStats[]>([]);
  const [decksLoading, setDecksLoading] = useState(true);
  const [decksError, setDecksError] = useState<string | null>(null);

  // Study session
  const [studyLevel, setStudyLevel] = useState(0);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFace, setCardFace] = useState<CardFace>('front');
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [studyLoading, setStudyLoading] = useState(false);

  const currentCard = cards[cardIndex] ?? null;

  // ── Fetch deck stats ───────────────────────────────────────────────────────

  const fetchDecks = useCallback(async () => {
    if (!accessToken) return;
    setDecksLoading(true);
    setDecksError(null);
    try {
      const res = await fetch(`${API_URL}/api/srs/decks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load decks');
      const data: DeckStats[] = await res.json();
      setDecks(data);
    } catch {
      setDecksError('Could not load deck stats. Please try again.');
    } finally {
      setDecksLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (user && accessToken) fetchDecks();
    else setDecksLoading(false);
  }, [user, accessToken, fetchDecks]);

  // ── Start study session ────────────────────────────────────────────────────

  const startStudy = async (level: number) => {
    if (!accessToken) return;
    setStudyLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/srs/study/${level}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load study cards');
      const data: StudyCard[] = await res.json();
      if (data.length === 0) return; // nothing to study
      setCards(data);
      setCardIndex(0);
      setCardFace('front');
      setSessionCorrect(0);
      setSessionTotal(0);
      setStudyLevel(level);
      setView('study');
    } catch {
      alert('Could not load study cards. Please try again.');
    } finally {
      setStudyLoading(false);
    }
  };

  // ── Submit review ──────────────────────────────────────────────────────────

  const submitReview = async (quality: 0 | 2 | 4 | 5) => {
    if (!currentCard || submitting || !accessToken) return;
    setSubmitting(true);
    try {
      await fetch(`${API_URL}/api/srs/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({ wordId: currentCard.wordId, quality }),
      });
      const passed = quality >= 3;
      setSessionCorrect(c => c + (passed ? 1 : 0));
      setSessionTotal(t => t + 1);

      if (cardIndex + 1 >= cards.length) {
        setCardFace('done');
      } else {
        setCardIndex(i => i + 1);
        setCardFace('front');
      }
    } catch {
      alert('Failed to save review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const backToDecks = () => {
    setView('decks');
    setCards([]);
    fetchDecks(); // refresh due counts
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--muted-color)' }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
        <h2 style={{ marginBottom: 8 }}>HSK Flashcards</h2>
        <p style={{ color: 'var(--muted-color)', marginBottom: 32 }}>
          Log in to study spaced repetition flashcards for HSK levels 1–6.
        </p>
        <button
          onClick={loginWithPatreon}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            padding: '4px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Login with Patreon"
          aria-label="Login with Patreon"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 569 546" width="56" height="56" aria-hidden="true">
            <circle cx="363" cy="205" r="205" fill="#FF424D" />
            <rect x="0" y="0" width="112" height="546" fill="#052D49" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Study session: done ────────────────────────────────────────────────────

  if (view === 'study' && cardFace === 'done') {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h2 style={{ marginBottom: 8 }}>Session Complete!</h2>
        <p style={{ color: 'var(--muted-color)', marginBottom: 24 }}>HSK Level {studyLevel}</p>
        <div
          style={{
            background: 'var(--bg-color, rgba(255,255,255,0.05))',
            border: '1px solid var(--border-color)',
            borderRadius: 12,
            padding: '24px 32px',
            marginBottom: 32,
            display: 'flex',
            justifyContent: 'space-around',
          }}
        >
          <div>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{sessionTotal}</div>
            <div style={{ color: 'var(--muted-color)', fontSize: 14 }}>Cards reviewed</div>
          </div>
          <div>
            <div style={{ fontSize: 40, fontWeight: 700, color: 'rgba(16, 185, 129, 0.9)' }}>
              {sessionCorrect}
            </div>
            <div style={{ color: 'var(--muted-color)', fontSize: 14 }}>Correct</div>
          </div>
          <div>
            <div style={{ fontSize: 40, fontWeight: 700, color: 'rgba(220, 38, 38, 0.9)' }}>
              {sessionTotal - sessionCorrect}
            </div>
            <div style={{ color: 'var(--muted-color)', fontSize: 14 }}>Again</div>
          </div>
        </div>
        <button
          onClick={backToDecks}
          style={{
            backgroundColor: HSK_COLORS[studyLevel],
            border: 'none',
            padding: '12px 28px',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
          }}
        >
          Back to Decks
        </button>
      </div>
    );
  }

  // ── Study session: front / back ────────────────────────────────────────────

  if (view === 'study' && currentCard) {
    const displayPinyin = convertPinyinStyle(currentCard.pinyin, pinyinStyle);
    const progress = `${cardIndex + 1} / ${cards.length}`;
    const levelColor = HSK_COLORS[studyLevel];

    return (
      <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 24px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <button
            onClick={backToDecks}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'inherit',
              fontSize: 14,
            }}
          >
            ← Decks
          </button>
          <span style={{ color: 'var(--muted-color)', fontSize: 14 }}>
            HSK {studyLevel} · {progress}
          </span>
          <span
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 20,
              backgroundColor: currentCard.isNew ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: currentCard.isNew ? 'rgba(16, 185, 129, 1)' : 'rgba(59, 130, 246, 1)',
            }}
          >
            {currentCard.isNew ? 'New' : `${currentCard.interval}d`}
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 4,
            background: 'var(--border-color)',
            borderRadius: 2,
            marginBottom: 32,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${((cardIndex + (cardFace === 'done' ? 1 : 0)) / cards.length) * 100}%`,
              backgroundColor: levelColor,
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {/* Card */}
        <div
          style={{
            background: 'var(--bg-color, rgba(255,255,255,0.03))',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: '48px 32px',
            textAlign: 'center',
            minHeight: 240,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          {/* Chinese characters */}
          <div style={{ fontSize: 72, lineHeight: 1.1, fontWeight: 500 }}>
            {currentCard.simplified}
          </div>

          {/* Pinyin */}
          <div style={{ fontSize: 24, color: levelColor, fontStyle: 'italic' }}>
            {displayPinyin}
          </div>

          {/* English — only shown on back */}
          {cardFace === 'back' && (
            <div
              style={{
                marginTop: 8,
                fontSize: 18,
                color: 'var(--text-color)',
                maxWidth: 400,
                lineHeight: 1.5,
                borderTop: '1px solid var(--border-color)',
                paddingTop: 20,
              }}
            >
              {currentCard.english || '—'}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ marginTop: 24 }}>
          {cardFace === 'front' ? (
            <button
              onClick={() => setCardFace('back')}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: levelColor,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                color: '#fff',
                fontWeight: 600,
                fontSize: 16,
              }}
            >
              Show Answer
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              {(
                [
                  { label: 'Again', quality: 0 as const, color: 'rgba(220, 38, 38, 0.85)', hint: '< 1d' },
                  { label: 'Hard', quality: 2 as const, color: 'rgba(245, 158, 11, 0.85)', hint: '~1d' },
                  { label: 'Good', quality: 4 as const, color: 'rgba(59, 130, 246, 0.85)', hint: `${currentCard.repetitions === 0 ? '1d' : currentCard.repetitions === 1 ? '6d' : Math.round(currentCard.interval * currentCard.easeFactor) + 'd'}` },
                  { label: 'Easy', quality: 5 as const, color: 'rgba(16, 185, 129, 0.85)', hint: 'longer' },
                ] as const
              ).map(({ label, quality, color, hint }) => (
                <button
                  key={label}
                  onClick={() => submitReview(quality)}
                  disabled={submitting}
                  style={{
                    padding: '12px 8px',
                    backgroundColor: color,
                    border: 'none',
                    borderRadius: 8,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    opacity: submitting ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>{hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Deck selection ─────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
      <h2 style={{ marginBottom: 8 }}>HSK Flashcard Decks</h2>
      <p style={{ color: 'var(--muted-color)', marginBottom: 32 }}>
        Spaced repetition study for all HSK vocabulary levels.
      </p>

      {decksError && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            color: '#dc2626',
            borderRadius: 8,
            marginBottom: 24,
          }}
        >
          {decksError}
        </div>
      )}

      {decksLoading ? (
        <div style={{ color: 'var(--muted-color)', textAlign: 'center', padding: '60px 0' }}>
          Loading decks…
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map(level => {
            const deck = decks.find(d => d.level === level) ?? {
              level,
              totalWords: 0,
              studiedCards: 0,
              dueCards: 0,
            };
            const color = HSK_COLORS[level];
            const canStudy = deck.totalWords > 0;
            const newAvailable = deck.totalWords - deck.studiedCards;

            return (
              <div
                key={level}
                style={{
                  background: 'var(--bg-color, rgba(255,255,255,0.03))',
                  border: `1px solid var(--border-color)`,
                  borderRadius: 12,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {/* Level header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {level}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>HSK Level {level}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-color)' }}>
                      {HSK_LABELS[level]}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
                  >
                    <span style={{ color: 'var(--muted-color)' }}>Total words</span>
                    <span style={{ fontWeight: 500 }}>{deck.totalWords}</span>
                  </div>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
                  >
                    <span style={{ color: 'var(--muted-color)' }}>Studied</span>
                    <span style={{ fontWeight: 500 }}>{deck.studiedCards}</span>
                  </div>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
                  >
                    <span style={{ color: 'var(--muted-color)' }}>Due today</span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: deck.dueCards > 0 ? 'rgba(239, 68, 68, 0.9)' : 'inherit',
                      }}
                    >
                      {deck.dueCards}
                    </span>
                  </div>
                  {newAvailable > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: 'var(--muted-color)' }}>New available</span>
                      <span style={{ fontWeight: 500, color: 'rgba(16, 185, 129, 0.9)' }}>
                        {newAvailable}
                      </span>
                    </div>
                  )}
                </div>

                {/* Study button */}
                <button
                  onClick={() => startStudy(level)}
                  disabled={!canStudy || studyLoading}
                  style={{
                    marginTop: 4,
                    padding: '10px',
                    backgroundColor: canStudy ? color : 'rgba(128, 128, 128, 0.3)',
                    border: 'none',
                    borderRadius: 8,
                    cursor: canStudy && !studyLoading ? 'pointer' : 'not-allowed',
                    color: canStudy ? '#fff' : 'var(--muted-color)',
                    fontWeight: 600,
                    fontSize: 14,
                    opacity: studyLoading ? 0.7 : 1,
                  }}
                >
                  {studyLoading ? 'Loading…' : deck.dueCards > 0 ? `Study (${deck.dueCards} due)` : 'Study'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
