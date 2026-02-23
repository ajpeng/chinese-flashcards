import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { convertPinyinStyle } from '../utils/pinyin';

// Set document title helper
function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Chinese Flashcards`;
    return () => { document.title = 'Chinese Flashcards'; };
  }, [title]);
}

const API_URL = import.meta.env.VITE_API_URL || 'https://api.ajpeng.ca';

// ─── Types ───────────────────────────────────────────────────────────────────

type DeckStats = {
  level: number;
  totalWords: number;
  studiedCards: number;
  dueCards: number;
};

type SavedDeckStats = {
  totalWords: number;
  studiedCards: number;
  dueCards: number;
};

// Interval options for the saved-words frequency picker
const INTERVAL_OPTIONS = [
  { label: 'Due now',  days: 0 },
  { label: '1 day',   days: 1 },
  { label: '3 days',  days: 3 },
  { label: '1 week',  days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

type StudyCard = {
  flashcardId: string | null;
  wordId: number;
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number | null;
  interval: number;
  repetitions: number;
  easeFactor: number;
  isNew: boolean;
};

type StudyLevel = number | 'saved';
type View = 'decks' | 'study' | 'preview';
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
  const { user, accessToken, loading } = useAuth();
  const pinyinStyle = user?.pinyinStyle ?? 'marks';
  const [searchParams, setSearchParams] = useSearchParams();

  // Deck selection
  const [view, setView] = useState<View>('decks');
  const [decks, setDecks] = useState<DeckStats[]>([]);
  const [savedDeck, setSavedDeck] = useState<SavedDeckStats | null>(null);
  const [decksLoading, setDecksLoading] = useState(true);
  const [decksError, setDecksError] = useState<string | null>(null);

  // Study session
  const [studyLevel, setStudyLevel] = useState<StudyLevel>(0);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFace, setCardFace] = useState<CardFace>('front');
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [studyLoading, setStudyLoading] = useState(false);

  // Preview session
  const [previewLevel, setPreviewLevel] = useState<StudyLevel>(0);
  const [previewCards, setPreviewCards] = useState<StudyCard[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [highlightedWord, setHighlightedWord] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLDivElement | null>(null);

  // Saved-deck management
  const [clearingAll, setClearingAll] = useState(false);
  const [deletingWordId, setDeletingWordId] = useState<number | null>(null);
  const [reschedulingWordId, setReschedulingWordId] = useState<number | null>(null);

  // Add custom card modal
  const MAX_CUSTOM_CHARS = 6;
  const [showAddModal, setShowAddModal] = useState(false);
  const [addInput, setAddInput] = useState('');           // step 1: what the user types
  const [addLooking, setAddLooking] = useState(false);    // step 1: lookup in progress
  const [addLookupError, setAddLookupError] = useState<string | null>(null);
  const [addPreview, setAddPreview] = useState<{         // step 2: lookup result
    simplified: string; pinyin: string; english: string; hskLevel: number | null;
  } | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const currentCard = cards[cardIndex] ?? null;
  const submittingRef = useRef(false);

  // Dynamic page title
  usePageTitle(
    view === 'study'
      ? studyLevel === 'saved' ? 'Study Saved Words' : `Study HSK ${studyLevel}`
    : view === 'preview'
      ? previewLevel === 'saved' ? 'Browse Saved Words' : `Browse HSK ${previewLevel}`
    : 'Flashcards'
  );

  // ── Fetch deck stats ───────────────────────────────────────────────────────

  const fetchDecks = useCallback(async () => {
    if (!accessToken) return;
    setDecksLoading(true);
    setDecksError(null);
    try {
      const [hskRes, savedRes] = await Promise.all([
        fetch(`${API_URL}/api/srs/decks`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        }),
        fetch(`${API_URL}/api/srs/saved`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        }),
      ]);
      if (!hskRes.ok) throw new Error('Failed to load decks');
      const hskData: DeckStats[] = await hskRes.json();
      setDecks(hskData);
      if (savedRes.ok) {
        const savedData: SavedDeckStats = await savedRes.json();
        setSavedDeck(savedData);
      }
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

  // ── Deep-link: ?word=有&level=1 → open preview and highlight word ──────────
  useEffect(() => {
    const wordParam = searchParams.get('word');
    const levelParam = searchParams.get('level');
    if (!wordParam || !levelParam || !accessToken) return;
    const level = parseInt(levelParam, 10);
    if (isNaN(level)) return;

    setHighlightedWord(wordParam);
    startPreview(level);
    // Clear params so back-navigation works cleanly
    setSearchParams({}, { replace: true });
  }, [accessToken]); // run once when accessToken is ready

  // ── Scroll highlighted word into view after preview loads ─────────────────
  useEffect(() => {
    if (highlightedWord && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedWord, previewCards]);

  // ── Start study session ────────────────────────────────────────────────────

  const startStudy = async (level: StudyLevel) => {
    if (!accessToken) return;
    setStudyLoading(true);
    try {
      const url = level === 'saved'
        ? `${API_URL}/api/srs/study/saved`
        : `${API_URL}/api/srs/study/${level}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load study cards');
      const data: StudyCard[] = await res.json();
      if (data.length === 0) {
        setStudyLevel(level);
        setCards([]);
        setCardFace('done');
        setSessionCorrect(0);
        setSessionTotal(0);
        setView('study');
        return;
      }
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

  // ── Start preview ─────────────────────────────────────────────────────────

  const startPreview = async (level: StudyLevel) => {
    if (!accessToken) return;
    setPreviewLoading(true);
    try {
      const url = level === 'saved'
        ? `${API_URL}/api/srs/preview/saved`
        : `${API_URL}/api/srs/preview/${level}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load preview cards');
      const data: StudyCard[] = await res.json();
      setPreviewCards(data);
      setPreviewLevel(level);
      setView('preview');
    } catch {
      alert('Could not load preview. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Submit review ──────────────────────────────────────────────────────────

  const submitReview = useCallback(async (quality: 2 | 5) => {
    if (!currentCard || submittingRef.current || !accessToken) return;
    submittingRef.current = true;
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

      setCards(prev => {
        const next = [...prev];
        next[cardIndex] = { ...next[cardIndex], isNew: false };
        return next;
      });

      if (cardIndex + 1 >= cards.length) {
        setCardFace('done');
        fetchDecks(); // refresh studied counts immediately when session ends
      } else {
        setCardIndex(i => i + 1);
        setCardFace('front');
      }
    } catch {
      alert('Failed to save review. Please try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [currentCard, accessToken, cardIndex, cards.length, fetchDecks]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (view !== 'study' || cardFace === 'done') return;
      // Any key (except pure modifier keys) reveals the answer when on front
      const isModifierOnly = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(e.key);
      if (cardFace === 'front' && !isModifierOnly) {
        setCardFace('back');
        return;
      }
      if (e.key === 'ArrowLeft') {
        if (cardFace === 'back') submitReview(2); // Hard
      } else if (e.key === 'ArrowRight') {
        if (cardFace === 'back') submitReview(5); // Easy
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, cardFace, submitReview]);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speak = async (text: string) => {
    try {
      const res = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'zh-CN-XiaoxiaoNeural', rate: '0.8' }),
      });
      if (!res.ok) return;
      const data = await res.json();
      new Audio(`data:audio/wav;base64,${data.audioData}`).play();
    } catch { /* ignore TTS errors silently */ }
  };

  const backToDecks = () => {
    setView('decks');
    setCards([]);
    fetchDecks(); // refresh due counts
  };

  // ── Saved-deck management ──────────────────────────────────────────────────

  const deleteSavedWord = async (wordId: number) => {
    if (!accessToken) return;
    setDeletingWordId(wordId);
    try {
      await fetch(`${API_URL}/api/srs/saved/${wordId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      setPreviewCards(prev => prev.filter(c => c.wordId !== wordId));
      fetchDecks();
    } catch {
      alert('Failed to remove word. Please try again.');
    } finally {
      setDeletingWordId(null);
    }
  };

  const rescheduleSavedWord = async (wordId: number, days: number) => {
    if (!accessToken) return;
    setReschedulingWordId(wordId);
    try {
      await fetch(`${API_URL}/api/srs/saved/${wordId}/interval`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({ days }),
      });
      setPreviewCards(prev => prev.map(c =>
        c.wordId === wordId ? { ...c, interval: days } : c
      ));
      fetchDecks();
    } catch {
      alert('Failed to reschedule word. Please try again.');
    } finally {
      setReschedulingWordId(null);
    }
  };

  const clearSavedDeck = async () => {
    if (!accessToken) return;
    if (!confirm('Remove all saved words from your flashcard deck? This cannot be undone.')) return;
    setClearingAll(true);
    try {
      await fetch(`${API_URL}/api/srs/saved`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      setSavedDeck(null);
      setPreviewCards([]);
      setView('decks');
      fetchDecks();
    } catch {
      alert('Failed to clear saved deck. Please try again.');
    } finally {
      setClearingAll(false);
    }
  };

  const openAddModal = () => {
    setAddInput('');
    setAddPreview(null);
    setAddLookupError(null);
    setAddError(null);
    setShowAddModal(true);
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = addInput.trim();
    if (!word) return;
    if (word.length > MAX_CUSTOM_CHARS) {
      setAddLookupError(`Please enter at most ${MAX_CUSTOM_CHARS} characters.`);
      return;
    }
    if (!/^[\u4E00-\u9FFF\u3400-\u4DBF]+$/.test(word)) {
      setAddLookupError('Please enter Chinese characters only.');
      return;
    }
    setAddLooking(true);
    setAddLookupError(null);
    setAddPreview(null);
    try {
      const res = await fetch(`${API_URL}/api/words/lookup?q=${encodeURIComponent(word)}`);
      if (res.status === 404) { setAddLookupError('Word not found in the dictionary.'); return; }
      if (!res.ok) { setAddLookupError('Lookup failed. Please try again.'); return; }
      const data = await res.json();
      if (!data.pinyin || !data.english) { setAddLookupError('No definition found for this word.'); return; }
      setAddPreview({ simplified: word, pinyin: data.pinyin, english: data.english, hskLevel: data.hskLevel ?? null });
    } catch {
      setAddLookupError('Lookup failed. Please try again.');
    } finally {
      setAddLooking(false);
    }
  };

  const handleConfirmAdd = async () => {
    if (!accessToken || !addPreview) return;
    setAddSubmitting(true);
    setAddError(null);
    try {
      const res = await fetch(`${API_URL}/api/srs/saved/custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ simplified: addPreview.simplified, pinyin: addPreview.pinyin, english: addPreview.english }),
      });
      if (res.status === 409) { setAddError('You already have a card for this word.'); return; }
      if (!res.ok) { setAddError('Failed to create card. Please try again.'); return; }
      setShowAddModal(false);
      fetchDecks();
    } catch {
      setAddError('Failed to create card. Please try again.');
    } finally {
      setAddSubmitting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--muted-color)' }}>
        Loading…
      </div>
    );
  }

  // ── Study session: done / all caught up ───────────────────────────────────

  if (view === 'study' && cardFace === 'done') {
    const allCaughtUp = sessionTotal === 0;
    const levelLabel = studyLevel === 'saved' ? 'Saved Words' : `HSK ${studyLevel}`;
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', textAlign: 'center', padding: '0 16px' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{allCaughtUp ? '✅' : '🎉'}</div>
        <h2 style={{ marginBottom: 8 }}>{allCaughtUp ? 'All caught up!' : 'Session Complete!'}</h2>
        <p style={{ color: 'var(--muted-color)', marginBottom: 24 }}>
          {allCaughtUp
            ? `No cards due for ${levelLabel}. Come back tomorrow!`
            : levelLabel}
        </p>
        {!allCaughtUp && (
        <div
          style={{
            background: 'var(--bg-color, rgba(255,255,255,0.05))',
            border: '1px solid var(--border-color)',
            borderRadius: 12,
            padding: '20px 16px',
            marginBottom: 32,
            display: 'flex',
            justifyContent: 'space-around',
          }}
        >
          <div>
            <div style={{ fontSize: 36, fontWeight: 700 }}>{sessionTotal}</div>
            <div style={{ color: 'var(--muted-color)', fontSize: 13 }}>Reviewed</div>
          </div>
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'rgba(16, 185, 129, 0.9)' }}>
              {sessionCorrect}
            </div>
            <div style={{ color: 'var(--muted-color)', fontSize: 13 }}>Correct</div>
          </div>
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'rgba(220, 38, 38, 0.9)' }}>
              {sessionTotal - sessionCorrect}
            </div>
            <div style={{ color: 'var(--muted-color)', fontSize: 13 }}>Again</div>
          </div>
        </div>
        )}
        <button
          onClick={backToDecks}
          style={{
            backgroundColor: studyLevel === 'saved' ? 'rgba(100, 108, 255, 0.8)' : HSK_COLORS[studyLevel as number],
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
    const levelColor = studyLevel === 'saved' ? 'rgba(100, 108, 255, 0.8)' : HSK_COLORS[studyLevel as number];
    const levelLabel = studyLevel === 'saved' ? 'Saved Words' : `HSK ${studyLevel}`;

    return (
      <div style={{ maxWidth: 560, margin: '24px auto', padding: '0 16px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            gap: 8,
          }}
        >
          <button
            onClick={backToDecks}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'inherit',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            ← Decks
          </button>
          <span style={{ color: 'var(--muted-color)', fontSize: 13, textAlign: 'center', minWidth: 0 }}>
            {levelLabel} · {progress}
          </span>
          <span
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 20,
              flexShrink: 0,
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
            marginBottom: 20,
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

        {/* Card — click anywhere to reveal answer when on front */}
        <div
          onClick={() => { if (cardFace === 'front') setCardFace('back'); }}
          style={{
            background: 'var(--bg-color, rgba(255,255,255,0.03))',
            border: '1px solid var(--border-color)',
            borderRadius: 16,
            padding: '32px 20px',
            textAlign: 'center',
            minHeight: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            cursor: cardFace === 'front' ? 'pointer' : 'default',
            userSelect: 'none',
          }}
        >
          {/* Chinese characters — click to open word detail page */}
          <Link
            to={`/words/${encodeURIComponent(currentCard.simplified)}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 'clamp(48px, 15vw, 72px)',
              lineHeight: 1.1,
              fontWeight: 500,
              color: 'inherit',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
            title="Click to view word details"
          >
            {currentCard.simplified}
          </Link>

          {/* Pinyin + speaker icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'clamp(16px, 5vw, 24px)', color: levelColor, fontStyle: 'italic' }}>
              {displayPinyin}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); speak(currentCard.simplified); }}
              title="Listen"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 18, opacity: 0.5, padding: '2px 4px',
                transition: 'opacity 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
            >
              🔊
            </button>
          </div>

          {/* English — only shown on back */}
          {cardFace === 'back' && (
            <div
              style={{
                marginTop: 8,
                fontSize: 'clamp(14px, 4vw, 18px)',
                color: 'var(--text-color)',
                maxWidth: 360,
                lineHeight: 1.5,
                borderTop: '1px solid var(--border-color)',
                paddingTop: 16,
              }}
            >
              {currentCard.english || '—'}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ marginTop: 20 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(
                [
                  { label: 'Hard', quality: 2 as const, color: 'rgba(245, 158, 11, 0.85)', key: '←' },
                  { label: 'Easy', quality: 5 as const, color: 'rgba(16, 185, 129, 0.85)', key: '→' },
                ] as const
              ).map(({ label, quality, color, key }) => (
                <button
                  key={label}
                  onClick={() => submitReview(quality)}
                  disabled={submitting}
                  style={{
                    padding: '14px 8px',
                    backgroundColor: color,
                    border: 'none',
                    borderRadius: 8,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 16,
                    opacity: submitting ? 0.6 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: 11, opacity: 0.75 }}>{key}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  if (view === 'preview') {
    const levelColor = previewLevel === 'saved' ? 'rgba(100, 108, 255, 0.8)' : HSK_COLORS[previewLevel as number];
    const previewTitle = previewLevel === 'saved'
      ? 'Saved Words'
      : `HSK ${previewLevel} · ${HSK_LABELS[previewLevel as number]}`;
    const isSavedPreview = previewLevel === 'saved';
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingTop: 8 }}>
          <button
            onClick={() => { setView('decks'); setPreviewCards([]); }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              padding: '6px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'inherit',
              fontSize: 14,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            ← Decks
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {previewTitle}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted-color)' }}>
              {previewCards.length} words
            </div>
          </div>
        </div>

        {/* Saved-words hint */}
        {isSavedPreview && previewCards.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--muted-color)', marginBottom: 12 }}>
            Use the interval picker to change how often each word is reviewed, or remove it with 🗑.
          </div>
        )}

        {/* Word list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {previewCards.map(card => {
            const isHighlighted = card.simplified === highlightedWord;
            const isDeleting = deletingWordId === card.wordId;
            const isRescheduling = reschedulingWordId === card.wordId;
            return (
            <div
              key={card.wordId}
              ref={isHighlighted ? highlightedRowRef : null}
              style={{
                background: isHighlighted ? 'rgba(100,108,255,0.1)' : 'var(--bg-color, rgba(255,255,255,0.03))',
                border: isHighlighted ? '1px solid rgba(100,108,255,0.4)' : '1px solid var(--border-color)',
                borderRadius: 10,
                padding: '10px 12px',
                transition: 'background 0.3s, border-color 0.3s',
                opacity: isDeleting ? 0.4 : 1,
              }}
            >
              {/* Top row: character · pinyin+english · badge */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: '0 10px' }}>
                {/* Chinese character — links to word detail page */}
                <Link
                  to={`/words/${encodeURIComponent(card.simplified)}`}
                  style={{ fontSize: 24, fontWeight: 500, color: levelColor, lineHeight: 1.2, textDecoration: 'none' }}
                  title="View stroke order & examples"
                >
                  {card.simplified}
                </Link>

                {/* Pinyin + English stacked */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted-color)', fontStyle: 'italic' }}>
                    {convertPinyinStyle(card.pinyin, pinyinStyle)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-color)', marginTop: 2 }}>
                    {card.english || '—'}
                  </div>
                </div>

                {/* Badge */}
                <span
                  style={{
                    fontSize: 11,
                    padding: '2px 7px',
                    borderRadius: 20,
                    whiteSpace: 'nowrap',
                    alignSelf: 'center',
                    backgroundColor: card.isNew ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                    color: card.isNew ? 'rgba(16, 185, 129, 1)' : 'rgba(59, 130, 246, 1)',
                  }}
                >
                  {card.isNew ? 'New' : `${card.interval}d`}
                </span>
              </div>

              {/* Bottom row (saved words only): interval picker + delete */}
              {isSavedPreview && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted-color)', whiteSpace: 'nowrap' }}>
                    Review every
                  </label>
                  <select
                    value={card.interval}
                    disabled={isRescheduling || isDeleting}
                    onChange={(e) => rescheduleSavedWord(card.wordId, Number(e.target.value))}
                    style={{
                      fontSize: 11,
                      padding: '2px 4px',
                      borderRadius: 4,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-color, transparent)',
                      color: 'var(--text-color)',
                      cursor: isRescheduling || isDeleting ? 'not-allowed' : 'pointer',
                      opacity: isRescheduling ? 0.5 : 1,
                    }}
                  >
                    {INTERVAL_OPTIONS.map(opt => (
                      <option key={opt.days} value={opt.days}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {isRescheduling && (
                    <span style={{ fontSize: 11, color: 'var(--muted-color)' }}>Saving…</span>
                  )}
                  {/* Spacer */}
                  <div style={{ flex: 1 }} />
                  {/* Delete button */}
                  <button
                    onClick={() => deleteSavedWord(card.wordId)}
                    disabled={isDeleting || isRescheduling}
                    title="Remove from saved deck"
                    style={{
                      background: 'none',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 5,
                      padding: '2px 7px',
                      cursor: isDeleting || isRescheduling ? 'not-allowed' : 'pointer',
                      color: 'rgba(239,68,68,0.7)',
                      fontSize: 12,
                      opacity: isDeleting ? 0.4 : 1,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {isDeleting ? '…' : '🗑'}
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Deck selection ─────────────────────────────────────────────────────────

  const savedColor = 'rgba(100, 108, 255, 0.8)';

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <h2 style={{ marginBottom: 8 }}>HSK Flashcard Decks</h2>
      <p style={{ color: 'var(--muted-color)', marginBottom: 24 }}>
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
        <>
        {/* Saved Words deck */}
        {savedDeck && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                background: 'var(--bg-color, rgba(255,255,255,0.03))',
                border: `1px solid ${savedColor}`,
                borderRadius: 12,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    backgroundColor: savedColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  ★
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Saved Words</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-color)' }}>
                    Words saved from articles
                  </div>
                </div>
                {/* Add card button */}
                <button
                  onClick={openAddModal}
                  title="Create a custom flashcard"
                  style={{
                    background: 'none',
                    border: `1px solid ${savedColor}`,
                    borderRadius: 6,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    color: savedColor,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  + Add Card
                </button>
                {/* Clear all button */}
                <button
                  onClick={clearSavedDeck}
                  disabled={clearingAll || savedDeck.totalWords === 0}
                  title="Remove all saved words from this deck"
                  style={{
                    background: 'none',
                    border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: 6,
                    padding: '4px 8px',
                    cursor: clearingAll || savedDeck.totalWords === 0 ? 'not-allowed' : 'pointer',
                    color: 'rgba(239,68,68,0.8)',
                    fontSize: 11,
                    fontWeight: 600,
                    opacity: clearingAll || savedDeck.totalWords === 0 ? 0.4 : 1,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {clearingAll ? 'Clearing…' : 'Clear all'}
                </button>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted-color)' }}>Saved words</span>
                  <span style={{ fontWeight: 500 }}>{savedDeck.totalWords}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted-color)' }}>Due today</span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: savedDeck.dueCards > 0 ? 'rgba(239, 68, 68, 0.9)' : 'inherit',
                    }}
                  >
                    {savedDeck.dueCards}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <button
                  onClick={() => startStudy('saved')}
                  disabled={savedDeck.totalWords === 0 || studyLoading}
                  style={{
                    flex: 1,
                    padding: '9px 6px',
                    backgroundColor: savedDeck.totalWords > 0 ? savedColor : 'rgba(128, 128, 128, 0.3)',
                    border: 'none',
                    borderRadius: 8,
                    cursor: savedDeck.totalWords > 0 && !studyLoading ? 'pointer' : 'not-allowed',
                    color: savedDeck.totalWords > 0 ? '#fff' : 'var(--muted-color)',
                    fontWeight: 600,
                    fontSize: 13,
                    opacity: studyLoading ? 0.7 : 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {studyLoading ? 'Loading…' : savedDeck.dueCards > 0 ? `Study (${savedDeck.dueCards})` : 'Study'}
                </button>
                <button
                  onClick={() => startPreview('saved')}
                  disabled={savedDeck.totalWords === 0 || previewLoading}
                  title="Browse saved words"
                  style={{
                    padding: '9px 12px',
                    backgroundColor: 'transparent',
                    border: `1px solid var(--border-color)`,
                    borderRadius: 8,
                    cursor: savedDeck.totalWords > 0 && !previewLoading ? 'pointer' : 'not-allowed',
                    color: savedDeck.totalWords > 0 ? 'var(--text-color)' : 'var(--muted-color)',
                    fontSize: 13,
                    opacity: previewLoading ? 0.7 : 1,
                    flexShrink: 0,
                  }}
                >
                  Browse
                </button>
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
            gap: 12,
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
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Level header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      backgroundColor: color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {level}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>HSK Level {level}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-color)' }}>
                      {HSK_LABELS[level]}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button
                    onClick={() => startStudy(level)}
                    disabled={!canStudy || studyLoading}
                    style={{
                      flex: 1,
                      padding: '9px 6px',
                      backgroundColor: canStudy ? color : 'rgba(128, 128, 128, 0.3)',
                      border: 'none',
                      borderRadius: 8,
                      cursor: canStudy && !studyLoading ? 'pointer' : 'not-allowed',
                      color: canStudy ? '#fff' : 'var(--muted-color)',
                      fontWeight: 600,
                      fontSize: 13,
                      opacity: studyLoading ? 0.7 : 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {studyLoading ? 'Loading…' : deck.dueCards > 0 ? `Study (${deck.dueCards})` : 'Study'}
                  </button>
                  <button
                    onClick={() => startPreview(level)}
                    disabled={!canStudy || previewLoading}
                    title="Browse all words"
                    style={{
                      padding: '9px 12px',
                      backgroundColor: 'transparent',
                      border: `1px solid var(--border-color)`,
                      borderRadius: 8,
                      cursor: canStudy && !previewLoading ? 'pointer' : 'not-allowed',
                      color: canStudy ? 'var(--text-color)' : 'var(--muted-color)',
                      fontSize: 13,
                      opacity: previewLoading ? 0.7 : 1,
                      flexShrink: 0,
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* ── Add Custom Card Modal ─────────────────────────────────────────── */}
      {showAddModal && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => !addLooking && !addSubmitting && setShowAddModal(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          />
          {/* Modal */}
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)', zIndex: 401,
            width: 'min(400px, calc(100vw - 32px))',
            background: 'var(--card-bg)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: '24px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Add Card</h3>
              <button
                onClick={() => setShowAddModal(false)}
                disabled={addLooking || addSubmitting}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--muted-color)', lineHeight: 1, padding: '0 2px' }}
              >×</button>
            </div>

            {/* Step 1 — Chinese input */}
            <form onSubmit={handleLookup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-color)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
                  Chinese word or phrase
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={addInput}
                    onChange={e => {
                      setAddInput(e.target.value);
                      setAddPreview(null);
                      setAddLookupError(null);
                    }}
                    placeholder="e.g. 学习"
                    autoFocus
                    style={{
                      width: '100%', padding: '10px 48px 10px 12px', borderRadius: 8,
                      border: `1px solid ${addLookupError ? 'rgba(239,68,68,0.6)' : 'var(--border-color)'}`,
                      background: 'var(--bg-secondary, rgba(128,128,128,0.08))',
                      color: 'var(--text-color)', fontSize: 22,
                      boxSizing: 'border-box', outline: 'none',
                      letterSpacing: 2,
                    }}
                  />
                  {/* Character counter — based on trimmed value */}
                  <span style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 11, color: addInput.trim().length > MAX_CUSTOM_CHARS ? 'rgba(239,68,68,0.8)' : 'var(--muted-color)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {addInput.trim().length}/{MAX_CUSTOM_CHARS}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--muted-color)', margin: '5px 0 0', lineHeight: 1.4 }}>
                  Max {MAX_CUSTOM_CHARS} Chinese characters · pinyin &amp; definition auto-filled
                </p>
              </div>

              {addLookupError && (
                <div style={{ fontSize: 13, color: 'rgba(239,68,68,0.9)', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                  {addLookupError}
                </div>
              )}

              {/* Step 2 — Preview card */}
              {addPreview && (
                <div style={{
                  border: `1px solid ${savedColor}`,
                  borderRadius: 12, padding: '16px',
                  background: 'rgba(100,108,255,0.06)',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: savedColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Preview
                  </div>
                  <div style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.1, color: savedColor }}>
                    {addPreview.simplified}
                  </div>
                  <div style={{ fontSize: 14, color: savedColor, fontStyle: 'italic', opacity: 0.85 }}>
                    {convertPinyinStyle(addPreview.pinyin, pinyinStyle)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-color)', lineHeight: 1.5 }}>
                    {addPreview.english}
                  </div>
                  {addPreview.hskLevel && (
                    <span style={{
                      alignSelf: 'flex-start', fontSize: 11, padding: '2px 8px',
                      borderRadius: 20, fontWeight: 600,
                      background: 'rgba(100,108,255,0.15)', color: savedColor,
                    }}>
                      HSK {addPreview.hskLevel}
                    </span>
                  )}
                </div>
              )}

              {addError && (
                <div style={{ fontSize: 13, color: 'rgba(239,68,68,0.9)', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                  {addError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={addLooking || addSubmitting}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'transparent', color: 'var(--muted-color)',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>

                {/* Show "Look up" until we have a preview, then "Add to deck" */}
                {!addPreview ? (
                  <button
                    type="submit"
                    disabled={addInput.length === 0 || addLooking}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                      background: addInput.length === 0 || addLooking ? 'rgba(100,108,255,0.4)' : savedColor,
                      color: '#fff', fontSize: 14, fontWeight: 600,
                      cursor: addInput.length === 0 || addLooking ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {addLooking ? 'Looking up…' : 'Look up'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConfirmAdd}
                    disabled={addSubmitting}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                      background: addSubmitting ? 'rgba(100,108,255,0.4)' : savedColor,
                      color: '#fff', fontSize: 14, fontWeight: 600,
                      cursor: addSubmitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {addSubmitting ? 'Adding…' : 'Add to deck'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
