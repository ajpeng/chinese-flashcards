import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { convertPinyinStyle } from '../utils/pinyin';
import { convertChineseText } from '../utils/chinese-conversion';

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

function ArticleContent({ content, words, showPinyin = false, onToggle, markingSet, savedSet, learnedSet, pinyinStyle = 'marks', fontSize = 'medium', highlightedTokenIndex = -1, selectedVoice = '', speechRate = 0.8, onStartReadingFromToken, textVariant = 'simplified', backendTokens = [], wordTimings = [] }: { content: string; words: Word[]; showPinyin?: boolean; onToggle?: (wordId: number) => Promise<boolean>; markingSet?: Set<number>; savedSet?: Set<number>; learnedSet?: Set<number>; pinyinStyle?: 'marks' | 'numbers'; fontSize?: 'small' | 'medium' | 'large' | 'xlarge'; highlightedTokenIndex?: number; selectedVoice?: string; speechRate?: number; onStartReadingFromToken?: (tokenIndex: number) => void; textVariant?: 'simplified' | 'traditional'; backendTokens?: Array<{ text: string; word?: Word; index: number }>; wordTimings?: Array<{ word: string; start: number; duration: number; audioOffset: number }> }) {
  // Use backend tokens if available, otherwise fall back to frontend tokenization
  const tokens = useMemo(() => {
    return backendTokens.length > 0 ? backendTokens : tokenize(content, words);
  }, [backendTokens, content, words]);

  const speak = async (text: string) => {
    try {
      const API_URL = 'https://api.ajpeng.ca';
      const response = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice: selectedVoice,
          rate: speechRate.toString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Create audio element and play
      const audio = new Audio(`data:audio/wav;base64,${data.audioData}`);
      audio.play();
    } catch (error) {
      console.error('TTS Error:', error);
      alert('Failed to generate speech');
    }
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

  // Use wordTimings as primary source if available, otherwise fall back to tokens
  const renderItems = wordTimings.length > 0 ? wordTimings : tokens.map((t, idx) => ({ word: t.text, timingIndex: idx, tokenData: t }));

  return (
    <div style={{ lineHeight: 1.6, fontSize: getFontSizeValue(fontSize), textAlign: 'left' }}>
      {renderItems.map((item, idx) => {
        // For timing-based rendering
        if ('word' in item && 'start' in item) {
          const timing = item;
          const wordText = timing.word;
          const isHighlighted = idx === highlightedTokenIndex;
          
          // Try to find word data from the original tokens/words array for definitions
          const matchingWord = words.find(w => w.simplified === wordText);
          const key = matchingWord ? `w-${matchingWord.id}-${idx}` : `t-${idx}`;

          return (
            <span
              key={key}
              data-pinyin={matchingWord?.pinyin ?? ''}
              data-english={matchingWord?.english ?? ''}
              style={{
                cursor: matchingWord ? 'pointer' : 'default',
                background: isHighlighted ? 'rgba(34, 197, 94, 0.6)' : (matchingWord ? 'rgba(255, 255, 0, 0.06)' : 'transparent'),
                borderBottom: matchingWord ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                marginRight: matchingWord ? '2px' : '0',
                transition: 'background 0.2s ease',
              }}
              className="word-token"
              aria-label={matchingWord ? `${matchingWord.simplified}, pinyin ${convertPinyinStyle(matchingWord.pinyin, pinyinStyle)}, ${matchingWord.english}` : undefined}
              tabIndex={matchingWord ? 0 : -1}
              title={matchingWord ? `${convertPinyinStyle(matchingWord.pinyin, pinyinStyle)} — ${matchingWord.english}` : undefined}
              onClick={matchingWord ? (e) => {
                e.stopPropagation();
                speak(matchingWord.simplified);
              } : undefined}
              onDoubleClick={matchingWord && onStartReadingFromToken ? (e) => {
                e.stopPropagation();
                onStartReadingFromToken(idx);
              } : undefined}
            >
              {showPinyin && matchingWord ? (
                <ruby style={{ lineHeight: 2.2 }}>
                  {convertChineseText(wordText, textVariant)}
                  <rt style={{ fontSize: '0.6em', opacity: 0.9, marginBottom: '2px' }}>
                    {convertPinyinStyle(matchingWord.pinyin, pinyinStyle)}
                  </rt>
                </ruby>
              ) : (
                convertChineseText(wordText, textVariant)
              )}

              {matchingWord && (
                <div className="token-popup" role="tooltip">
                  <div className="popup-text">
                    <div className="popup-pinyin">{convertPinyinStyle(matchingWord.pinyin, pinyinStyle)}</div>
                    <div className="popup-english">{matchingWord.english}</div>
                  </div>
                  <div className="popup-actions">
                    <button
                      type="button"
                      className="speak-btn"
                      onClick={() => speak(matchingWord.simplified)}
                      title="Listen to pronunciation"
                    >
                      🔊
                    </button>
                    {onToggle && (
                      <>
                        <button
                          type="button"
                          className={`learn-btn ${learnedSet?.has(matchingWord.id) ? 'learned' : ''}`}
                          onClick={() => onToggle(matchingWord.id)}
                          disabled={markingSet?.has(matchingWord.id)}
                          title={learnedSet?.has(matchingWord.id) ? 'Mark as not learned' : 'Mark as learned'}
                        >
                          {markingSet?.has(matchingWord.id) ? '⏳' : (learnedSet?.has(matchingWord.id) ? '✓' : '📚')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </span>
          );
        } 
        
        // Fallback to token-based rendering when no timings available
        const t = (item as any).tokenData || item;
        const key = t.word ? `w-${t.word.id}-${idx}` : `t-${idx}`;
        const isHighlighted = idx === highlightedTokenIndex;

        if (showPinyin) {
          // When pinyin is shown, render every token as a ruby so the pinyin
          // line stays aligned; and include a popup that contains pinyin + actions
          return (
            <span
              key={key}
              data-pinyin={t.word?.pinyin ?? ''}
              data-english={t.word?.english ?? ''}
              style={{
                cursor: t.word ? 'pointer' : 'default',
                background: isHighlighted ? 'rgba(34, 197, 94, 0.6)' : (t.word ? 'rgba(255, 255, 0, 0.06)' : 'transparent'),
                borderBottom: t.word ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                marginRight: t.word ? '2px' : '0',
                transition: 'background 0.2s ease',
              }}
              className="word-token"
              aria-label={t.word ? `${t.word.simplified}, pinyin ${convertPinyinStyle(t.word.pinyin, pinyinStyle)}, ${t.word.english}` : undefined}
              tabIndex={t.word ? 0 : -1}
              title={t.word ? `${convertPinyinStyle(t.word.pinyin, pinyinStyle)} — ${t.word.english}` : undefined}
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
                {convertChineseText(t.text, textVariant)}
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
                                        onClick={() => {
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
                                          onClick={async () => {
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
            data-pinyin={t.word.pinyin}
            data-english={t.word.english}
            style={{
              cursor: 'pointer',
              background: isHighlighted ? 'rgba(34, 197, 94, 0.6)' : 'rgba(255, 255, 0, 0.06)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
              marginRight: '2px',
              transition: 'background 0.2s ease',
            }}
            className="word-token"
            aria-label={`${t.word.simplified}, pinyin ${convertPinyinStyle(t.word.pinyin, pinyinStyle)}, ${t.word.english}`}
            tabIndex={0}
            title={`${convertPinyinStyle(t.word.pinyin, pinyinStyle)} — ${t.word.english}`}
            onClick={(e) => {
              e.stopPropagation();
              speak(t.word!.simplified);
            }}
            onDoubleClick={onStartReadingFromToken ? (e) => {
              e.stopPropagation();
              onStartReadingFromToken(idx);
            } : undefined}
          >
            {convertChineseText(t.text, textVariant)}

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
                    onClick={() => {
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
                      onClick={async () => {
                        // e.stopPropagation(); // Removed to avoid interfering with popup visibility
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
          <span key={key}>{convertChineseText(t.text, textVariant)}</span>
        );
      })}
    </div>
  );
}

export default function Articles(): React.ReactElement {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Article[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPinyin, setShowPinyin] = useState<boolean>(false);
  const [localFontSize, setLocalFontSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  const [localTextVariant, setLocalTextVariant] = useState<'simplified' | 'traditional'>('simplified');
  const [speechRate, setSpeechRate] = useState<number>(0.8);
  const [selectedVoice, setSelectedVoice] = useState<string>('zh-CN-XiaoxiaoNeural');
  const [availableVoices] = useState<string[]>(['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunxiaNeural', 'zh-CN-YunyangNeural']);
  const [voicesLoaded, setVoicesLoaded] = useState<boolean>(true);
  const [currentAudioSrc, setCurrentAudioSrc] = useState<string | null>(null);
  const [, setAudioSegments] = useState<Array<{ text: string; start: number; end: number; index: number }>>([]);
  const [tokens, setTokens] = useState<Array<{ text: string; word?: Word; index: number }>>([]);
  const [wordTimings, setWordTimings] = useState<Array<{ word: string; start: number; duration: number; audioOffset: number }>>([]);
  const [readingArticleId, setReadingArticleId] = useState<number | null>(null);
  const [highlightedTokenIndex, setHighlightedTokenIndex] = useState<number>(-1);
  const [, setIsPaused] = useState<boolean>(false);
  const [, setCurrentAudioTime] = useState<number>(0); // Track current audio time
  const [, setAudioDuration] = useState<number>(0); // Track audio duration

  // Learned word IDs (synchronized with backend) and marking state for in-flight requests
  const [learnedIds, setLearnedIds] = useState<number[]>([]);
  const [markingIds, setMarkingIds] = useState<number[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const learnedSet = useMemo(() => new Set(learnedIds), [learnedIds]);
  const markingSet = useMemo(() => new Set(markingIds), [markingIds]);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const API_URL = 'https://api.ajpeng.ca';

  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  // Get user's pinyin style preference, default to 'marks'
  const pinyinStyle = user?.pinyinStyle || 'marks';

  // Function to sync settings to backend
  const syncSettingsToBackend = useCallback(async (settings: {
    fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
    speechRate?: number;
    voiceName?: string;
    textVariant?: 'simplified' | 'traditional';
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

      // Don't refresh user data immediately - let the server update naturally
      // await refreshUser(); // REMOVED to prevent infinite loops
    } catch (error) {
      console.error('Error syncing settings:', error);
    }
  }, [user, accessToken]);

  // Initialize local settings from user preferences
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
    if (user?.textVariant) {
      setLocalTextVariant(user.textVariant);
    }
  }, [user?.fontSize, user?.speechRate, user?.voiceName, user?.textVariant]);

  // Sync font size changes to backend
  useEffect(() => {
    if (user?.fontSize && localFontSize !== user.fontSize) {
      syncSettingsToBackend({ fontSize: localFontSize });
    }
  }, [localFontSize, user?.fontSize, syncSettingsToBackend]);

  // Sync speech rate changes to backend
  useEffect(() => {
    if (user?.speechRate !== undefined && speechRate !== user.speechRate) {
      syncSettingsToBackend({ speechRate });
    }
  }, [speechRate, user?.speechRate, syncSettingsToBackend]);

  // Sync voice selection changes to backend
  useEffect(() => {
    if (selectedVoice !== (user?.voiceName || '')) {
      syncSettingsToBackend({ voiceName: selectedVoice || '' });
    }
  }, [selectedVoice, user?.voiceName, syncSettingsToBackend]);

  // Sync text variant changes to backend
  useEffect(() => {
    if (user?.textVariant && localTextVariant !== user.textVariant) {
      syncSettingsToBackend({ textVariant: localTextVariant });
    }
  }, [localTextVariant, user?.textVariant, syncSettingsToBackend]);

  // Azure TTS voices are pre-defined, no need to load dynamically
  useEffect(() => {
    // Azure voices are already set in state, mark as loaded
    setVoicesLoaded(true);
  }, []);

  // Cleanup effect to handle navigation - stop audio when component unmounts
  useEffect(() => {
    return () => {
      // Reset reading state
      setReadingArticleId(null);
      setHighlightedTokenIndex(-1);
      setCurrentAudioSrc(null);
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

  const speak = async (text: string) => {
    try {
      const response = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice: selectedVoice,
          rate: speechRate.toString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Create new audio element and play
      const audio = new Audio(`data:audio/wav;base64,${data.audioData}`);
      audio.play();
    } catch (error) {
      console.error('TTS Error:', error);
      alert('Failed to generate speech');
    }
  };

  const readParagraph = async (articleId: number, content: string, words: Word[], _startPosition?: number) => {
    // 1. If clicking the currently playing article, let the native player handle it
    if (readingArticleId === articleId && currentAudioSrc) {
      // Audio is already loaded, user can control it with native controls
      return;
    }

    // 2. Stop any existing audio (reset)
    setCurrentAudioSrc(null);
    
    // Reset State
    setReadingArticleId(articleId);
    setHighlightedTokenIndex(-1);
    setIsPaused(false);
    setCurrentAudioTime(0);
    setAudioDuration(0);
    setWordTimings([]);  // Clear previous word timings

    // 3. Start new reading
    await startAzureReading(articleId, content, words);
  };

  const startAzureReading = async (_articleId: number, content: string, _words: Word[]) => {
    try {
      const convertedContent = convertChineseText(content, localTextVariant);
      
      const response = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: convertedContent,
          voice: selectedVoice,
          rate: speechRate.toString(),
          words: _words
        })
      });
      
      if (!response.ok) throw new Error(`TTS request failed`);
      
      const data = await response.json();
      
      // Set audio segments and tokenization from backend
      setAudioSegments(data.segments || []);
      setTokens(data.tokens || []);
      setWordTimings(data.timings || []);
      
      
      // Set duration from TTS response
      if (data.totalDuration && data.totalDuration > 0) {
        setAudioDuration(data.totalDuration / 1000);
      }

      // Set the audio source for the native player
      const audioSrc = `data:audio/wav;base64,${data.audioData}`;
      setCurrentAudioSrc(audioSrc);

    } catch (error) {
      console.error('Azure TTS Error:', error);
      setReadingArticleId(null);
      setIsPaused(false);
    }
  };

  const startReadingFromToken = async (articleId: number, content: string, words: Word[], _tokenIndex: number) => {
      readParagraph(articleId, content, words, 0); 
  };

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/articles`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
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
        <button 
          onClick={async () => {
            const newVariant = localTextVariant === 'simplified' ? 'traditional' : 'simplified';
            setLocalTextVariant(newVariant);
            await syncSettingsToBackend({ textVariant: newVariant });
          }}
          style={{
            padding: '6px 12px',
            background: 'rgba(100, 108, 255, 0.1)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            fontSize: '0.85em',
            cursor: 'pointer'
          }}
          title={`Switch to ${localTextVariant === 'simplified' ? 'Traditional' : 'Simplified'} Chinese`}
        >
          {localTextVariant === 'simplified' ? 'Traditional 繁' : 'Simplified 简'}
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
            title={`Current voice: ${selectedVoice || 'Default'}`}
          >
            <option value="">Default Voice</option>
            {availableVoices.map((voice, index) => (
              <option key={`${voice}-${index}`} value={voice}>
                {voice}
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
                  <h3 style={{ margin: 0 }}>
                    {article.title}
                  </h3>
                  {/* Audio Status Indicator - Minimal */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.8em',
                    color: 'var(--muted-color)',
                    minWidth: '70px' // Stable width
                  }}>
                    {readingArticleId === article.id && currentAudioSrc ? (
                      <>
                        <span style={{ color: 'rgb(34, 197, 94)' }}>🎵</span>
                        <span style={{ color: 'rgb(34, 197, 94)' }}>Playing</span>
                      </>
                    ) : readingArticleId === article.id ? (
                      <>
                        <span style={{ color: 'rgba(128, 128, 128, 0.7)' }}>⏳</span>
                        <span style={{ color: 'rgba(128, 128, 128, 0.7)' }}>Loading</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: 'rgba(128, 128, 128, 0.5)' }}>🎧</span>
                        <span style={{ color: 'rgba(128, 128, 128, 0.5)' }}>Audio</span>
                      </>
                    )}
                  </div>
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

              {/* Native HTML5 Audio Player */}
              <div style={{ 
                marginBottom: 16, 
                padding: '12px 16px',
                background: readingArticleId === article.id 
                  ? 'rgba(34, 197, 94, 0.05)' 
                  : 'rgba(128, 128, 128, 0.02)', 
                borderRadius: 8, 
                border: readingArticleId === article.id 
                  ? '1px solid rgba(34, 197, 94, 0.2)' 
                  : '1px solid rgba(255, 255, 255, 0.05)',
                transition: 'all 0.3s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <button
                    onClick={() => readParagraph(article.id, article.content, article.words)}
                    disabled={!voicesLoaded}
                    style={{
                      padding: '8px 12px',
                      background: readingArticleId === article.id && currentAudioSrc
                        ? 'rgba(34, 197, 94, 0.1)'
                        : 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgb(34, 197, 94)',
                      borderRadius: 6,
                      fontSize: '0.85em',
                      cursor: voicesLoaded ? 'pointer' : 'not-allowed',
                      color: 'rgb(34, 197, 94)',
                      fontWeight: 500,
                      opacity: voicesLoaded ? 1 : 0.6
                    }}
                    title={readingArticleId === article.id ? 'Audio is ready' : 'Generate and play audio'}
                  >
                    {!voicesLoaded ? '⏳ Loading...' : readingArticleId === article.id ? '🎧 Audio Ready' : '▶️ Play Article'}
                  </button>
                  
                  {readingArticleId === article.id && (
                    <button
                      onClick={() => {
                        setCurrentAudioSrc(null);
                        setReadingArticleId(null);
                        setHighlightedTokenIndex(-1);
                        setIsPaused(false);
                        setCurrentAudioTime(0);
                        setAudioDuration(0);
                      }}
                      style={{
                        padding: '6px 10px',
                        background: 'rgba(220, 38, 38, 0.1)',
                        border: '1px solid rgb(220, 38, 38)',
                        borderRadius: 4,
                        fontSize: '0.8em',
                        cursor: 'pointer',
                        color: 'rgb(220, 38, 38)',
                        fontWeight: 500
                      }}
                      title="Stop and reset audio"
                    >
                      ⏹️ Stop
                    </button>
                  )}
                  
                  <div style={{ 
                    fontSize: '0.8em', 
                    color: 'var(--muted-color)',
                    display: 'flex',
                    gap: 12
                  }}>
                    <span>Speed: {speechRate}x</span>
                    <span>Voice: {selectedVoice.replace('zh-CN-', '').replace('Neural', '') || 'Default'}</span>
                  </div>
                </div>
                
                {/* Native Audio Element - Only show when audio is ready */}
                {readingArticleId === article.id && currentAudioSrc && (
                  <div style={{ marginTop: 8 }}>
                    <audio 
                      controls 
                      style={{ 
                        width: '100%', 
                        height: '40px',
                        accentColor: 'rgb(34, 197, 94)'
                      }}
                      onTimeUpdate={(e) => {
                        const audio = e.currentTarget;
                        setCurrentAudioTime(audio.currentTime);
                        
                        // Update highlighting based on current time using word timings
                        const nowMs = audio.currentTime * 1000;
                        
                        if (wordTimings.length > 0) {
                          // Use direct word timings from backend - now using direct index mapping
                          let highlightedWordIndex = -1;
                          
                          for (let i = 0; i < wordTimings.length; i++) {
                            const timing = wordTimings[i];
                            const wordStart = timing.start;
                            const wordEnd = timing.start + timing.duration;
                            
                            if (nowMs >= wordStart && nowMs <= wordEnd) {
                              highlightedWordIndex = i;
                              console.log(`Highlighting word ${highlightedWordIndex} for time ${nowMs.toFixed(0)}ms: "${timing.word}"`);
                              break;
                            }
                          }
                          
                          // Debug when no timing is found
                          if (highlightedWordIndex === -1) {
                            // Don't log on every frame, just when we lose highlighting
                            if (highlightedTokenIndex >= 0) {
                              console.log(`No word timing found for time ${nowMs.toFixed(0)}ms`);
                            }
                          }
                          
                          // Always update, even if -1 to clear highlighting between words
                          setHighlightedTokenIndex(highlightedWordIndex);
                        } else if (tokens.length > 0) {
                          // Fallback highlighting based on duration and backend tokens
                          if (audio.duration > 0) {
                            const percent = audio.currentTime / audio.duration;
                            const estimatedTokenIndex = Math.floor(percent * tokens.length);
                            const clampedIndex = Math.max(0, Math.min(estimatedTokenIndex, tokens.length - 1));
                            setHighlightedTokenIndex(clampedIndex);
                          }
                        }
                      }}
                      onLoadedMetadata={(e) => {
                        const audio = e.currentTarget;
                        if (audio.duration && audio.duration !== Infinity) {
                          setAudioDuration(audio.duration);
                        }
                      }}
                      onPlay={() => setIsPaused(false)}
                      onPause={() => setIsPaused(true)}
                      onEnded={() => {
                        setIsPaused(false);
                        setReadingArticleId(null);
                        setHighlightedTokenIndex(-1);
                        setCurrentAudioTime(0);
                      }}
                      src={currentAudioSrc}
                      autoPlay
                    />
                  </div>
                )}
              </div>

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
                speechRate={speechRate}
                onStartReadingFromToken={(tokenIndex) => startReadingFromToken(article.id, article.content, article.words, tokenIndex)}
                textVariant={localTextVariant}
                backendTokens={readingArticleId === article.id ? tokens : []}
                wordTimings={readingArticleId === article.id ? wordTimings : []}
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
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: 4 }}>HSK</th>
                          <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: 4 }}>Action</th>
                        </tr>
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
                                textDecorationLine: 'underline',
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
