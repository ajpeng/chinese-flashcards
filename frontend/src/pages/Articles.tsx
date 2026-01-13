import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { convertPinyinStyle } from '../utils/pinyin';

export type Word = {
  id: number;
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number;
};

export type Article = {
  id: number;
  title: string;
  content: string;
  hskLevel: number;
  createdAt?: string;
  updatedAt?: string;
  words: Word[];
};

type Token = { text: string; word?: Word };

function buildLookup(words: Word[]) {
  const map = new Map<string, Word>();
  let maxLen = 1;
  for (const w of words) {
    map.set(w.simplified, w);
    maxLen = Math.max(maxLen, w.simplified.length);
  }
  return { map, maxLen };
}

function tokenize(content: string, words: Word[]): Token[] {
  if (!content) return [];
  const { map, maxLen } = buildLookup(words || []);
  const tokens: Token[] = [];
  const isHan = (ch: string) => /[\u4E00-\u9FFF]/.test(ch); // basic CJK check
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (!isHan(ch)) {
      let j = i + 1;
      while (j < content.length && !isHan(content[j])) j++;
      tokens.push({ text: content.slice(i, j) });
      i = j;
      continue;
    }

    let matched: Word | undefined;
    let matchedLen = 0;
    for (let len = Math.min(maxLen, content.length - i); len > 0; len--) {
      const sub = content.substr(i, len);
      const w = map.get(sub);
      if (w) { 
        matched = w; 
        matchedLen = len; 
        break; 
      }
    }

    if (matched) {
      tokens.push({ text: content.substr(i, matchedLen), word: matched });
      i += matchedLen;
    } else {
      tokens.push({ text: ch });
      i++;
    }
  }

  return tokens;
}

function ArticleContent({ content, words, showPinyin = false, onToggle, markingSet, savedSet, learnedSet, pinyinStyle = 'marks', fontSize = 'medium', highlightedTokenIndex = -1, selectedVoice = '', availableVoices = [], speechRate = 0.8, onStartReadingFromToken }: { content: string; words: Word[]; showPinyin?: boolean; onToggle?: (wordId: number) => Promise<boolean>; markingSet?: Set<number>; savedSet?: Set<number>; learnedSet?: Set<number>; pinyinStyle?: 'marks' | 'numbers'; fontSize?: 'small' | 'medium' | 'large' | 'xlarge'; highlightedTokenIndex?: number; selectedVoice?: string; availableVoices?: SpeechSynthesisVoice[]; speechRate?: number; onStartReadingFromToken?: (tokenIndex: number) => void }) {
  const tokens = useMemo(() => tokenize(content, words), [content, words]);

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser');
      return;
    }

    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice if available
    if (selectedVoice && availableVoices.length > 0) {
      const voice = availableVoices.find(v => v.name === selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }
    }
    
    utterance.lang = 'zh-CN'; // Chinese Mandarin
    utterance.rate = speechRate; // Use provided speech rate
    window.speechSynthesis.speak(utterance);
  };

  const getFontSizeValue = (size: 'small' | 'medium' | 'large' | 'xlarge'): string => {
    switch (size) {
      case 'small': return '0.9em';
      case 'medium': return '1em';
      case 'large': return '1.2em';
      case 'xlarge': return '1.4em';
      default: return '1em';
    }
  };

  return (
    <p style={{ lineHeight: 1.6, fontSize: getFontSizeValue(fontSize), textAlign: 'left' }}>
      {tokens.map((t, idx) => {
        const key = t.word ? `w-${t.word.id}-${idx}` : `t-${idx}`;
        const isHighlighted = idx === highlightedTokenIndex;

        if (showPinyin) {
          // When pinyin is shown, render every token as a ruby so the pinyin
          // line stays aligned; and include a popup that contains pinyin + actions
          return (
            <span
              key={key}
              title={t.word ? `${convertPinyinStyle(t.word.pinyin, pinyinStyle)} — ${t.word.english}` : undefined}
              data-pinyin={t.word?.pinyin ?? ''}
              data-english={t.word?.english ?? ''}
              style={{
                cursor: t.word ? 'pointer' : 'default',
                background: isHighlighted ? 'rgba(100, 200, 255, 0.3)' : (t.word ? 'rgba(255, 255, 0, 0.06)' : 'transparent'),
                borderBottom: t.word ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                marginRight: t.word ? '2px' : '0',
                transition: 'background 0.2s ease',
              }}
              className="word-token"
              aria-label={t.word ? `${t.word.simplified}, pinyin ${convertPinyinStyle(t.word.pinyin, pinyinStyle)}, ${t.word.english}` : undefined}
              tabIndex={t.word ? 0 : -1}
              onClick={t.word ? (e) => {
                e.stopPropagation();
                speak(t.word!.simplified);
              } : undefined}
              onDoubleClick={t.word && onStartReadingFromToken ? (e) => {
                e.stopPropagation();
                onStartReadingFromToken(idx);
              } : undefined}
            >
              <ruby style={{ lineHeight: 2.2 }}>
                {t.text}
                <rt style={{ fontSize: '0.6em', opacity: 0.9, marginBottom: '2px' }}>{t.word ? convertPinyinStyle(t.word.pinyin, pinyinStyle) : '\u00A0'}</rt>
              </ruby>

              {t.word && (
                <div className="token-popup" role="tooltip">
                  <div className="popup-text">
                    <div className="popup-pinyin">{convertPinyinStyle(t.word.pinyin, pinyinStyle)}</div>
                    <div className="popup-english">{t.word.english}</div>
                  </div>
                  <div className="popup-actions">
                    <button
                      type="button"
                      className="speak-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(t.word!.simplified);
                      }}
                      title="Listen to pronunciation"
                    >
                      🔊
                    </button>

                    {onToggle && (
                      <button
                        type="button"
                        className="save-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await onToggle(t.word!.id);
                        }}
                        disabled={markingSet?.has(t.word.id)}
                        title={learnedSet?.has(t.word.id) ? 'Unlearn word' : 'Save word'}
                      >
                        {learnedSet?.has(t.word.id) ? '★' : '☆'}
                      </button>
                    )}

                    {savedSet?.has(t.word.id) && (
                      <span className="saved-confirm">Saved!</span>
                    )}
                  </div>
                </div>
              )}
            </span>
          );
        }

        // Default (no pinyin shown): render normally with optional popup for actions
        return t.word ? (
          <span
            key={key}
            title={`${convertPinyinStyle(t.word.pinyin, pinyinStyle)} — ${t.word.english}`}
            data-pinyin={t.word.pinyin}
            data-english={t.word.english}
            style={{
              cursor: 'pointer',
              background: isHighlighted ? 'rgba(100, 200, 255, 0.3)' : 'rgba(255, 255, 0, 0.06)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
              marginRight: '2px',
              transition: 'background 0.2s ease',
            }}
            className="word-token"
            aria-label={`${t.word.simplified}, pinyin ${convertPinyinStyle(t.word.pinyin, pinyinStyle)}, ${t.word.english}`}
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              speak(t.word!.simplified);
            }}
            onDoubleClick={onStartReadingFromToken ? (e) => {
              e.stopPropagation();
              onStartReadingFromToken(idx);
            } : undefined}
          >
            {t.text}

            {t.word && (
              <div className="token-popup" role="tooltip">
                <div className="popup-text">
                  <div className="popup-pinyin">{convertPinyinStyle(t.word.pinyin, pinyinStyle)}</div>
                  <div className="popup-english">{t.word.english}</div>
                </div>
                <div className="popup-actions">
                  <button
                    type="button"
                    className="speak-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      speak(t.word!.simplified);
                    }}
                    title="Listen to pronunciation"
                  >
                    🔊
                  </button>

                  {onToggle && (
                    <button
                      type="button"
                      className="save-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await onToggle(t.word!.id);
                      }}
                      disabled={markingSet?.has(t.word.id)}
                      title={learnedSet?.has(t.word.id) ? 'Unlearn word' : 'Save word'}
                      aria-pressed={learnedSet?.has(t.word.id)}
                    >
                      {learnedSet?.has(t.word.id) ? '★' : '☆'}
                    </button>
                  )}

                  {savedSet?.has(t.word.id) && (
                    <span className="saved-confirm">Saved!</span>
                  )}
                </div>
              </div>
            )}
          </span>
        ) : (
          <span key={key}>{t.text}</span>
        );
      })}
    </p>
  );
}

export default function Articles(): React.ReactElement {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Article[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPinyin, setShowPinyin] = useState<boolean>(false);
  const [localFontSize, setLocalFontSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  const [speechRate, setSpeechRate] = useState<number>(0.8);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState<boolean>(false);
  const [readingArticleId, setReadingArticleId] = useState<number | null>(null);
  const [highlightedTokenIndex, setHighlightedTokenIndex] = useState<number>(-1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [pausedPosition, setPausedPosition] = useState<number>(0);
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const voiceSelectRef = useRef<HTMLSelectElement>(null);
  const highlightTimerRef = useRef<number | null>(null);

  // Learned word IDs (synchronized with backend) and marking state for in-flight requests
  const [learnedIds, setLearnedIds] = useState<number[]>([]);
  const [markingIds, setMarkingIds] = useState<number[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const learnedSet = useMemo(() => new Set(learnedIds), [learnedIds]);
  const markingSet = useMemo(() => new Set(markingIds), [markingIds]);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const API_URL = import.meta.env.VITE_API_URL || '';

  const { user, accessToken, refreshUser } = useAuth();
  const navigate = useNavigate();

  // Get user's pinyin style preference, default to 'marks'
  const pinyinStyle = user?.pinyinStyle || 'marks';

  // Function to sync settings to backend
  const syncSettingsToBackend = async (settings: {
    fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
    speechRate?: number;
    voiceName?: string;
  }) => {
    if (!user || !accessToken) return;

    try {
      const response = await fetch(`${API_URL}/api/auth/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        console.error('Failed to sync settings:', response.statusText);
        return;
      }

      // Refresh user data to keep context in sync
      await refreshUser();
    } catch (error) {
      console.error('Error syncing settings:', error);
    }
  };

  // Initialize local font size from user preferences
  useEffect(() => {
    if (user?.fontSize) {
      setLocalFontSize(user.fontSize as 'small' | 'medium' | 'large' | 'xlarge');
    }
    if (user?.speechRate) {
      setSpeechRate(user.speechRate);
    }
    if (user?.voiceName) {
      setSelectedVoice(user.voiceName);
    }
  }, [user?.fontSize, user?.speechRate, user?.voiceName]);

  // Sync font size changes to backend
  useEffect(() => {
    if (user?.fontSize && localFontSize !== user.fontSize) {
      syncSettingsToBackend({ fontSize: localFontSize });
    }
  }, [localFontSize, user?.fontSize]);

  // Sync speech rate changes to backend
  useEffect(() => {
    if (user?.speechRate !== undefined && speechRate !== user.speechRate) {
      syncSettingsToBackend({ speechRate });
    }
  }, [speechRate, user?.speechRate]);

  // Sync voice selection changes to backend
  useEffect(() => {
    if (selectedVoice !== (user?.voiceName || '')) {
      syncSettingsToBackend({ voiceName: selectedVoice || '' });
    }
  }, [selectedVoice, user?.voiceName]);

  // Initialize available voices for speech synthesis
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        
        if (voices.length > 0) {
          // Filter for Chinese voices only (Mandarin and Cantonese)
          const chineseVoices = voices.filter(voice => 
            voice.lang.startsWith('zh')
          );
          
          setAvailableVoices(chineseVoices);
          setVoicesLoaded(true);
          
          // Set default voice - prefer Chinese voices
          if (chineseVoices.length > 0 && !selectedVoice) {
            const preferredVoice = chineseVoices.find(voice => 
              voice.lang === 'zh-CN' || voice.lang === 'zh-TW'
            ) || chineseVoices[0];
            setSelectedVoice(preferredVoice.name);
          }
        }
      }
    };

    // Initial load
    loadVoices();
    
    // Some browsers load voices asynchronously
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      
      // If no voices yet, try again after a short delay
      if (window.speechSynthesis.getVoices().length === 0) {
        setTimeout(loadVoices, 100);
      }
    }

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [selectedVoice]);

  // Cleanup effect to handle navigation - stop audio and close dropdowns
  useEffect(() => {
    return () => {
      // Stop any ongoing speech synthesis when component unmounts
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      
      // Clear highlight timer
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
      
      // Blur any focused elements (like select dropdowns) when component unmounts
      if (voiceSelectRef.current) {
        voiceSelectRef.current.blur();
      }
      
      // Reset reading state
      setReadingArticleId(null);
      setHighlightedTokenIndex(-1);
      setIsPaused(false);
      setPausedPosition(0);
    };
  }, []);

  // Fetch initial learned IDs from backend
  useEffect(() => {
    const fetchLearned = async () => {
      if (!user || !accessToken) return; // Only fetch if authenticated

      try {
        const res = await fetch(`${API_URL}/api/flashcards`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        const ids = Array.isArray(json) ? (json as Array<{ wordId?: number }>).map((r) => r.wordId).filter((n): n is number => typeof n === 'number') : [];
        setLearnedIds(ids);
      } catch (err) {
        console.error('Failed to load learned words', err);
      }
    };

    void fetchLearned();
  }, [user, accessToken]);

  const markLearned = async (wordId: number): Promise<boolean> => {
    if (!user || !accessToken) {
      alert('Please log in to save flashcards');
      navigate('/login');
      return false;
    }

    if (learnedSet.has(wordId) || markingSet.has(wordId)) return false;
    setMarkingIds((s) => [...s, wordId]);

    try {
      const res = await fetch(`${API_URL}/api/flashcards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({ wordId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      setLearnedIds((s) => (s.includes(wordId) ? s : [...s, wordId]));
      return true;
    } catch (err: unknown) {
      console.error('Failed to mark learned', err);
      alert('Failed to mark word as learned');
      return false;
    } finally {
      setMarkingIds((s) => s.filter((id) => id !== wordId));
    }
  };

  const unlearn = async (wordId: number): Promise<boolean> => {
    if (!user || !accessToken) {
      alert('Please log in to manage flashcards');
      navigate('/login');
      return false;
    }

    if (!learnedSet.has(wordId) || markingSet.has(wordId)) return false;
    setMarkingIds((s) => [...s, wordId]);

    try {
      const res = await fetch(`${API_URL}/api/flashcards/${wordId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      setLearnedIds((s) => s.filter((id) => id !== wordId));
      setSavedIds((s) => s.filter((id) => id !== wordId));
      return true;
    } catch (err: unknown) {
      console.error('Failed to unlearn', err);
      alert('Failed to unlearn word');
      return false;
    } finally {
      setMarkingIds((s) => s.filter((id) => id !== wordId));
    }
  };
  const saveWord = async (wordId: number) => {
    // Call markLearned so the same endpoint is used (and learned state is updated)
    const ok = await markLearned(wordId);
    if (!ok) return false;

    // Show a quick saved confirmation
    setSavedIds((s) => (s.includes(wordId) ? s : [...s, wordId]));
    setTimeout(() => setSavedIds((s) => s.filter((id) => id !== wordId)), 1400);
    return true;
  };

  const toggleLearn = async (wordId: number) => {
    if (learnedSet.has(wordId)) {
      return await unlearn(wordId);
    }
    return await saveWord(wordId);
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser');
      return;
    }

    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice if available
    if (selectedVoice && availableVoices.length > 0) {
      const voice = availableVoices.find(v => v.name === selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }
    }
    
    utterance.lang = 'zh-CN'; // Chinese Mandarin
    utterance.rate = speechRate;
    window.speechSynthesis.speak(utterance);
  };

  const readParagraph = (articleId: number, content: string, words: Word[], startPosition?: number) => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser');
      return;
    }

    // Don't proceed if voices aren't loaded
    if (!voicesLoaded) {
      console.log('Voices not loaded yet, cannot start reading');
      return;
    }

    // ALWAYS stop any existing audio first
    window.speechSynthesis.cancel();
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }

    // If this article is currently reading and not paused - pause it
    if (readingArticleId === articleId && !isPaused) {
      setIsPaused(true);
      setPausedPosition(highlightedTokenIndex);
      return;
    }

    // If this article is paused - resume from where we left off
    if (readingArticleId === articleId && isPaused) {
      setIsPaused(false);
      startReading(articleId, content, words, pausedPosition);
      return;
    }

    // Start fresh reading (either not reading anything, or reading a different article)
    // Reset any previous reading state
    setReadingArticleId(null);
    setHighlightedTokenIndex(-1);
    setIsPaused(false);
    setPausedPosition(0);
    setTotalTokens(0);
    
    // Small delay to ensure state is reset before starting
    setTimeout(() => {
      setReadingArticleId(articleId);
      setIsPaused(false);
      setPausedPosition(0);
      setHighlightedTokenIndex(0);
      startReading(articleId, content, words, startPosition || 0);
    }, 50);
  };

  const startReading = (articleId: number, content: string, words: Word[], startIndex: number = 0) => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in your browser');
      return;
    }

    // Don't start reading if voices aren't loaded yet
    if (!voicesLoaded) {
      console.log('Voices not loaded yet, waiting...');
      return;
    }

    // Force stop any existing speech and clear timers
    window.speechSynthesis.cancel();
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    
    // Ensure voices are loaded before proceeding
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      console.log('No voices available, cannot start reading');
      return;
    }

    console.log('Starting reading for article:', articleId, 'from index:', startIndex);
    
    const tokens = tokenize(content, words);
    setTotalTokens(tokens.length);
    let currentIndex = startIndex;

    const speakNextToken = () => {
      // Check if reading was stopped (but don't check isPaused here as it causes issues)
      if (readingArticleId !== articleId) {
        return;
      }

      if (currentIndex >= tokens.length) {
        setReadingArticleId(null);
        setHighlightedTokenIndex(-1);
        setIsPaused(false);
        setPausedPosition(0);
        return;
      }

      const token = tokens[currentIndex];
      setHighlightedTokenIndex(currentIndex);

      // Skip punctuation-only tokens (don't speak them)
      const isPunctuation = /^[。！？；，、：""''《》（）【】]+$/.test(token.text.trim());
      
      if (isPunctuation) {
        // Just move to next token without speaking
        currentIndex++;
        highlightTimerRef.current = setTimeout(speakNextToken, 200); // Brief pause for punctuation
        return;
      }

      const utterance = new SpeechSynthesisUtterance(token.text);
      
      // Set voice if available
      if (selectedVoice && availableVoices.length > 0) {
        const voice = availableVoices.find(v => v.name === selectedVoice);
        if (voice) {
          utterance.voice = voice;
        }
      }
      
      utterance.lang = 'zh-CN';
      utterance.rate = speechRate;

      // Backup timer in case onend doesn't fire (browser compatibility issue)
      const backupTimer = setTimeout(() => {
        if (window.speechSynthesis.speaking) {
          return;
        }
        currentIndex++;
        speakNextToken();
      }, 5000); // 5 second backup

      utterance.onend = () => {
        clearTimeout(backupTimer);
        currentIndex++;
        // Very short delay for flow
        highlightTimerRef.current = setTimeout(speakNextToken, 20);
      };

      utterance.onerror = (error) => {
        console.error('Speech error:', error);
        clearTimeout(backupTimer);
        // Try to continue to next token instead of stopping completely
        currentIndex++;
        highlightTimerRef.current = setTimeout(speakNextToken, 100);
      };
      
      // Make sure speech synthesis is ready and not speaking something else
      if (window.speechSynthesis.speaking) {
        console.log('Speech synthesis busy, cancelling...');
        window.speechSynthesis.cancel();
        // Wait a moment for cancellation to complete
        setTimeout(() => {
          window.speechSynthesis.speak(utterance);
        }, 100);
      } else {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      }
    };

    speakNextToken();
  };

  // Function to start reading from a specific token (for clicking on words)
  const startReadingFromToken = (articleId: number, content: string, words: Word[], tokenIndex: number) => {
    // Always stop any current reading first
    window.speechSynthesis.cancel();
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    readParagraph(articleId, content, words, tokenIndex);
  };

  const fetchArticles = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/articles`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as Article[];
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchArticles();
  }, []);

  return (
    <div style={{ maxWidth: 960 }}>
      <h2>Articles & Vocabulary</h2>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={fetchArticles} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <button onClick={() => setShowPinyin((s) => !s)} aria-pressed={showPinyin}>
          Toggle Pinyin
        </button>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '0.9em', color: 'var(--muted-color)' }}>Font:</span>
          <button
            onClick={() => setLocalFontSize('small')}
            style={{
              padding: '4px 8px',
              background: localFontSize === 'small' ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '0.85em'
            }}
            title="Small font size"
          >
            A
          </button>
          <button
            onClick={() => setLocalFontSize('medium')}
            style={{
              padding: '4px 8px',
              background: localFontSize === 'medium' ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '1em'
            }}
            title="Medium font size"
          >
            A
          </button>
          <button
            onClick={() => setLocalFontSize('large')}
            style={{
              padding: '4px 8px',
              background: localFontSize === 'large' ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '1.15em'
            }}
            title="Large font size"
          >
            A
          </button>
          <button
            onClick={() => setLocalFontSize('xlarge')}
            style={{
              padding: '4px 8px',
              background: localFontSize === 'xlarge' ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '1.3em'
            }}
            title="Extra large font size"
          >
            A
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: '0.9em', color: 'var(--muted-color)' }}>Speech:</span>
          <button
            onClick={() => setSpeechRate(0.5)}
            style={{
              padding: '4px 8px',
              background: speechRate === 0.5 ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '0.85em'
            }}
            title="Slow speech (0.5x)"
          >
            0.5x
          </button>
          <button
            onClick={() => setSpeechRate(0.8)}
            style={{
              padding: '4px 8px',
              background: speechRate === 0.8 ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '0.85em'
            }}
            title="Normal speech (0.8x)"
          >
            0.8x
          </button>
          <button
            onClick={() => setSpeechRate(1.0)}
            style={{
              padding: '4px 8px',
              background: speechRate === 1.0 ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '0.85em'
            }}
            title="Fast speech (1.0x)"
          >
            1.0x
          </button>
          <button
            onClick={() => setSpeechRate(1.2)}
            style={{
              padding: '4px 8px',
              background: speechRate === 1.2 ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '0.85em'
            }}
            title="Very fast speech (1.2x)"
          >
            1.2x
          </button>
          <button
            onClick={() => setSpeechRate(1.5)}
            style={{
              padding: '4px 8px',
              background: speechRate === 1.5 ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '0.85em'
            }}
            title="Extra fast speech (1.5x)"
          >
            1.5x
          </button>
          <button
            onClick={() => setSpeechRate(2.0)}
            style={{
              padding: '4px 8px',
              background: speechRate === 2.0 ? 'rgba(100, 108, 255, 0.2)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '0.85em'
            }}
            title="Super fast speech (2.0x)"
          >
            2.0x
          </button>
          <select
            ref={voiceSelectRef}
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            style={{
              padding: '4px 8px',
              border: '1px solid var(--border-color)',
              borderRadius: 4,
              fontSize: '0.85em',
              background: selectedVoice ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
              color: 'inherit',
              minWidth: '120px',
              maxWidth: '160px'
            }}
            title={`Current voice: ${selectedVoice ? availableVoices.find(v => v.name === selectedVoice)?.name || 'Default' : 'Default'}`}
          >
            <option value="">Default Voice</option>
            {availableVoices.map((voice, index) => (
              <option key={`${voice.name}-${index}`} value={voice.name}>
                {voice.name.length > 20 ? voice.name.substring(0, 17) + '...' : voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <div style={{ color: 'crimson', marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && data.length === 0 && !loading && <p>No articles found in the database.</p>}

      {data && data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {data.map((article) => (
            <article key={article.id} className="card">
              <header style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>{article.title}</h3>
                  {/* <button
                    onClick={() => readParagraph(article.id, article.content, article.words)}
                    disabled={!voicesLoaded}
                    style={{
                      padding: '6px 12px',
                      background: !voicesLoaded 
                        ? 'rgba(128, 128, 128, 0.1)' 
                        : readingArticleId === article.id ? 'rgba(220, 38, 38, 0.1)' : 'rgba(100, 108, 255, 0.1)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 4,
                      fontSize: '0.85em',
                      cursor: voicesLoaded ? 'pointer' : 'not-allowed',
                      opacity: voicesLoaded ? 1 : 0.6
                    }}
                    title={
                      !voicesLoaded
                        ? 'Loading voices...'
                        : readingArticleId === article.id && !isPaused 
                        ? 'Pause reading' 
                        : readingArticleId === article.id && isPaused
                        ? 'Resume reading'
                        : 'Start reading'
                    }
                  >
                    {!voicesLoaded 
                      ? '⏳ Loading...'
                      : readingArticleId === article.id && !isPaused 
                      ? '⏸ Pause' 
                      : readingArticleId === article.id && isPaused
                      ? '▶ Resume'
                      : '▶ Read'}
                    {readingArticleId === article.id && window.speechSynthesis?.speaking && (
                      <span style={{ marginLeft: '4px', fontSize: '10px' }}>🔊</span>
                    )}
                  
                  </button> */}
                </div>
                <div className="muted">
                  HSK level: <strong>{article.hskLevel}</strong>
                  {article.createdAt && (
                    <>
                      {' '}
                      · Created:{' '}
                      {new Date(article.createdAt).toLocaleDateString()}
                    </>
                  )}
                </div>
              </header>

              {/* YouTube-style progress scrubber for reading */}
              {readingArticleId === article.id && totalTokens > 0 && (
                <div style={{ marginBottom: 12, padding: '8px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.75em', color: 'var(--muted-color)', minWidth: '40px', fontFamily: 'monospace' }}>
                      {highlightedTokenIndex + 1}/{totalTokens}
                    </span>
                    <div 
                      style={{ 
                        flex: 1, 
                        height: '4px', 
                        background: 'rgba(255, 255, 255, 0.3)', 
                        borderRadius: '2px', 
                        position: 'relative',
                        cursor: 'pointer',
                        margin: '8px 0'
                      }}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const percentage = clickX / rect.width;
                        const targetIndex = Math.floor(percentage * totalTokens);
                        startReadingFromToken(article.id, article.content, article.words, targetIndex);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scaleY(1.5)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scaleY(1)';
                      }}
                    >
                      {/* Background progress track */}
                      <div 
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          background: 'rgba(255, 255, 255, 0.2)', 
                          borderRadius: '2px',
                          position: 'absolute'
                        }}
                      />
                      {/* Progress fill */}
                      <div 
                        style={{ 
                          width: `${Math.max(0, Math.min(100, ((highlightedTokenIndex + 1) / totalTokens) * 100))}%`, 
                          height: '100%', 
                          background: 'linear-gradient(90deg, rgba(255, 0, 0, 0.8) 0%, rgba(255, 255, 255, 0.9) 100%)', 
                          borderRadius: '2px',
                          transition: 'width 0.3s ease',
                          position: 'relative'
                        }}
                      >
                        {/* Scrubber handle */}
                        <div 
                          style={{ 
                            position: 'absolute',
                            right: '-6px',
                            top: '-4px',
                            width: '12px',
                            height: '12px',
                            background: 'white',
                            borderRadius: '50%',
                            border: '1px solid rgba(0,0,0,0.2)',
                            cursor: 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            transition: 'transform 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.3)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        />
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75em', color: 'var(--muted-color)', minWidth: '35px', textAlign: 'right' }}>
                      {Math.round(((highlightedTokenIndex + 1) / totalTokens) * 100)}%
                    </span>
                  </div>
                </div>
              )}

              <ArticleContent
                content={article.content}
                words={article.words}
                showPinyin={showPinyin}
                onToggle={toggleLearn}
                markingSet={markingSet}
                savedSet={savedSet}
                learnedSet={learnedSet}
                pinyinStyle={pinyinStyle}
                fontSize={localFontSize}
                highlightedTokenIndex={readingArticleId === article.id ? highlightedTokenIndex : -1}
                selectedVoice={selectedVoice}
                availableVoices={availableVoices}
                speechRate={speechRate}
                onStartReadingFromToken={(tokenIndex) => startReadingFromToken(article.id, article.content, article.words, tokenIndex)}
              />

              {article.words && article.words.length > 0 && (
                <section style={{ marginTop: 12 }}>
                  <h4 style={{ margin: '8px 0' }}>Vocabulary</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: 4 }}>Han Zi</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: 4 }}>Pinyin</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: 4 }}>English</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: 4 }}>HSK</th>                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: 4 }}>Action</th>                        </tr>
                      </thead>
                      <tbody>
                        {article.words.map((word) => (
                          <tr key={word.id}>
                            <td style={{ padding: 4, borderBottom: '1px solid var(--border-light)' }}>{word.simplified}</td>
                            <td
                              style={{
                                padding: 4,
                                borderBottom: '1px solid var(--border-light)',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                textDecorationStyle: 'dotted',
                                textDecorationColor: 'rgba(255, 255, 255, 0.3)'
                              }}
                              onClick={() => speak(word.simplified)}
                              title="Click to hear pronunciation"
                            >
                              {convertPinyinStyle(word.pinyin, pinyinStyle)}
                            </td>
                            <td style={{ padding: 4, borderBottom: '1px solid var(--border-light)' }}>{word.english}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid var(--border-light)' }}>{word.hskLevel}</td>
                            <td style={{ padding: 4, borderBottom: '1px solid var(--border-light)' }}>
                              <button
                                className="learn-toggle"
                                onClick={() => void (learnedSet.has(word.id) ? unlearn(word.id) : markLearned(word.id))}
                                disabled={markingSet.has(word.id)}
                                aria-pressed={learnedSet.has(word.id)}
                                title={learnedSet.has(word.id) ? 'Unlearn this word' : 'Mark this word as learned'}
                              >
                                {markingSet.has(word.id) ? (learnedSet.has(word.id) ? 'Unlearning…' : 'Marking…') : (learnedSet.has(word.id) ? 'Learned' : 'Mark learned')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
