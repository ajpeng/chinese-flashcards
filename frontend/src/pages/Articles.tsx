import React, { useEffect, useState, useMemo, useRef } from 'react';
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

function ArticleContent({ content, words, showPinyin = false, onToggle, markingSet, savedSet, learnedSet, pinyinStyle = 'marks', fontSize = 'medium', highlightedTokenIndex = -1, selectedVoice = '', speechRate = 0.8, onStartReadingFromToken, segments = [], activeWordIndex = -1, textVariant = 'simplified' }: { content: string; words: Word[]; showPinyin?: boolean; onToggle?: (wordId: number) => Promise<boolean>; markingSet?: Set<number>; savedSet?: Set<number>; learnedSet?: Set<number>; pinyinStyle?: 'marks' | 'numbers'; fontSize?: 'small' | 'medium' | 'large' | 'xlarge'; highlightedTokenIndex?: number; selectedVoice?: string; speechRate?: number; onStartReadingFromToken?: (tokenIndex: number) => void; segments?: Array<{ text: string; start: number; end: number; index: number }>; activeWordIndex?: number; textVariant?: 'simplified' | 'traditional' }) {
  const tokens = useMemo(() => tokenize(content, words), [content, words]);

  const speak = async (text: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
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

  return (
    <div style={{ lineHeight: 1.6, fontSize: getFontSizeValue(fontSize), textAlign: 'left' }}>
      {tokens.map((t, idx) => {
        const key = t.word ? `w-${t.word.id}-${idx}` : `t-${idx}`;
        const isHighlighted = idx === highlightedTokenIndex;
        const isActiveWord = activeWordIndex >= 0 && segments.length > 0 && 
          segments[activeWordIndex] && 
          idx >= segments[activeWordIndex].start && 
          idx < segments[activeWordIndex].end;

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
                background: isActiveWord ? 'rgba(255, 165, 0, 0.6)' : isHighlighted ? 'rgba(34, 197, 94, 0.4)' : (t.word ? 'rgba(255, 255, 0, 0.06)' : 'transparent'),
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
              background: isActiveWord ? 'rgba(255, 165, 0, 0.6)' : isHighlighted ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255, 255, 0, 0.06)',
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
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [, setAudioTimings] = useState<Array<{ segmentIndex: number; start: number; duration: number; word: string }>>([]);
  const [audioSegments, setAudioSegments] = useState<Array<{ text: string; start: number; end: number; index: number }>>([]);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [readingArticleId, setReadingArticleId] = useState<number | null>(null);
  const [highlightedTokenIndex, setHighlightedTokenIndex] = useState<number>(-1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const [currentAudioTime, setCurrentAudioTime] = useState<number>(0); // Track current audio time
  const [audioDuration, setAudioDuration] = useState<number>(0); // Track audio duration
  const [, forceUpdate] = useState<number>(0); // For forcing UI updates
  const voiceSelectRef = useRef<HTMLSelectElement>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const timeUpdateRef = useRef<(() => void) | null>(null);
  const progressUpdateRef = useRef<number | null>(null);

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

      // Refresh user data to keep context in sync
      await refreshUser();
    } catch (error) {
      console.error('Error syncing settings:', error);
    }
  };

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

  // Azure TTS voices are pre-defined, no need to load dynamically
  useEffect(() => {
    // Azure voices are already set in state, mark as loaded
    setVoicesLoaded(true);
  }, []);

  // Cleanup effect to handle navigation - stop audio and close dropdowns
  useEffect(() => {
    return () => {
      // Stop any ongoing Azure TTS audio when component unmounts
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      
      // Clear highlight timer
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
      
      // Clear progress update timer
      if (progressUpdateRef.current) {
        clearInterval(progressUpdateRef.current);
        progressUpdateRef.current = null;
      }
      
      // Blur any focused elements (like select dropdowns) when component unmounts
      if (voiceSelectRef.current) {
        voiceSelectRef.current.blur();
      }
      
      // Reset reading state
      setReadingArticleId(null);
      setHighlightedTokenIndex(-1);
      setIsPaused(false);
      setActiveWordIndex(-1);
    };
  }, [currentAudio]);

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
      
      // Stop any current audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      
      // Create new audio element and play
      const audio = new Audio(`data:audio/wav;base64,${data.audioData}`);
      setCurrentAudio(audio);
      audio.play();
    } catch (error) {
      console.error('TTS Error:', error);
      alert('Failed to generate speech');
    }
  };

  const readParagraph = async (articleId: number, content: string, words: Word[], startPosition?: number) => {
    if (!voicesLoaded) {
      console.log('Azure TTS not ready');
      return;
    }

    // Case 1: Clicked play button for the article currently playing. -> Pause it.
    if (readingArticleId === articleId && currentAudio && !currentAudio.paused) {
      console.log('Pausing current audio for the same article.');
      currentAudio.pause();
      setIsPaused(true);
      return;
    }

    // Case 2: Clicked play button for the article currently paused. -> Resume it.
    if (readingArticleId === articleId && currentAudio && currentAudio.paused) {
      console.log('Resuming audio for the same article.');
      setIsPaused(false);
      // currentAudio.currentTime is already at pausedPosition (set when paused)
      await currentAudio.play().catch(e => console.error("Error resuming audio:", e));
      // onplay event listener on currentAudio will re-establish interval updates
      return;
    }

    // If we reach here, it means:
    // a) A new article is requested (`readingArticleId !== articleId`)
    // b) No audio is currently associated (`!currentAudio` and also `readingArticleId` would likely be null)
    // In both cases, we need to stop any existing audio and start a new audio generation/playback.

    if (currentAudio) {
      console.log('Stopping and resetting audio from previous article or inconsistent state.');
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    // Clear any timers or related states from previous playback
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    if (progressUpdateRef.current) {
      clearInterval(progressUpdateRef.current);
      progressUpdateRef.current = null;
    }

    // Prepare for new playback
    console.log('Starting new audio playback.');
    setReadingArticleId(articleId);
    setHighlightedTokenIndex(-1);
    setIsPaused(false); // Should be false for new playback
    setActiveWordIndex(-1);
    setCurrentAudioTime(0);
    setAudioDuration(0);

    // Generate and play new audio
    await startAzureReading(articleId, content, words, startPosition || 0);
  };

  const startAzureReading = async (articleId: number, content: string, _words: Word[], startTime: number = 0) => {
    try {
      console.log('Starting Azure TTS reading for article:', articleId, 'from time:', startTime);
      
      // Convert text based on user preference for consistent TTS generation
      const convertedContent = convertChineseText(content, localTextVariant);
      
      // Generate TTS with word timings
      const response = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: convertedContent,
          voice: selectedVoice,
          rate: speechRate.toString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Stop any current audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      
      // Create audio element
      const audio = new Audio(`data:audio/wav;base64,${data.audioData}`);
      
      // Set states immediately
      setCurrentAudio(audio);
      setAudioTimings(data.mappings || []);
      setAudioSegments(data.segments || []);
      
      // Set total tokens based on actual tokenized content
      const tokens = tokenize(convertedContent, _words);
      setTotalTokens(tokens.length);
      
      // Initialize audio state variables
      setCurrentAudioTime(0);
      setAudioDuration(0);
      
      // Set up time tracking for word highlighting
      const updateActiveWord = () => {
        if (!audio || audio.paused || !audio.duration) {
          console.log('updateActiveWord skipped - audio:', !!audio, 'paused:', audio?.paused, 'duration:', audio?.duration);
          return;
        }
        
        const currentTime = audio.currentTime * 1000; // Convert to milliseconds
        let activeIndex = -1;
        let highlightIndex = -1;
        
        // Find the current active word based on timing
        if (data.mappings && data.mappings.length > 0) {
          for (let i = 0; i < data.mappings.length; i++) {
            const mapping = data.mappings[i];
            if (currentTime >= mapping.start && currentTime <= mapping.start + mapping.duration) {
              activeIndex = mapping.segmentIndex; // This is the index into data.segments
              
              // Directly use the start token index from the segment data
              if (data.segments && activeIndex !== -1 && data.segments[activeIndex]) {
                  highlightIndex = data.segments[activeIndex].start;
              }
              break;
            }
          }
        }
        
        // Fallback: estimate position based on time progress - this should be for highlightedTokenIndex if no mapping is found.
        if (highlightIndex < 0) { // Only use fallback if highlightIndex wasn't set by mapping
          // Ensure we tokenize the same content that was sent to TTS
          const tokens = tokenize(convertedContent, _words); 
          const timeProgress = Math.min(1, currentTime / (audio.duration * 1000));
          const estimatedIndex = Math.floor(timeProgress * Math.max(1, tokens.length - 1));
          highlightIndex = Math.max(0, estimatedIndex);
        }
        
        console.log('updateActiveWord - time:', Math.floor(currentTime/1000), 'activeIndex:', activeIndex, 'highlightIndex:', highlightIndex);
        
        setActiveWordIndex(activeIndex);
        setHighlightedTokenIndex(highlightIndex);
      };
      
      // Store the update function for cleanup
      timeUpdateRef.current = updateActiveWord;
      
      audio.onloadeddata = () => {
        console.log('Audio data loaded, duration:', audio.duration);
        // Set duration immediately when it becomes available
        setAudioDuration(audio.duration || 0);
        setCurrentAudioTime(audio.currentTime || 0);
        forceUpdate(prev => prev + 1);
      };

      audio.onplay = () => {
        console.log('Audio started playing');
        setIsPaused(false);
        updateActiveWord();
        
        // Start progress update timer
        progressUpdateRef.current = setInterval(() => {
          console.log('Timer tick - currentTime:', audio.currentTime, 'duration:', audio.duration);
          setCurrentAudioTime(audio.currentTime || 0);
          setAudioDuration(audio.duration || 0);
          updateActiveWord(); // Call updateActiveWord instead of just forceUpdate
          forceUpdate(prev => prev + 1);
        }, 100); // Update every 100ms for smooth progress
      };
      
      audio.onpause = () => {
        console.log('Audio paused');
        setIsPaused(true);
        
        // Clear progress update timer
        if (progressUpdateRef.current) {
          clearInterval(progressUpdateRef.current);
          progressUpdateRef.current = null;
        }
      };
      
      audio.onended = () => {
        console.log('Audio ended');
        setReadingArticleId(null);
        setActiveWordIndex(-1);
        setHighlightedTokenIndex(-1);
        setIsPaused(false);
        setCurrentAudio(null);
        setCurrentAudioTime(0);
        setAudioDuration(0);
        
        // Clear progress update timer
        if (progressUpdateRef.current) {
          clearInterval(progressUpdateRef.current);
          progressUpdateRef.current = null;
        }
      };
      
      audio.onerror = (error) => {
        console.error('Audio error:', error);
        alert('Failed to play audio');
        setReadingArticleId(null);
        setActiveWordIndex(-1);
        setIsPaused(false);
        setCurrentAudioTime(0);
        setAudioDuration(0);
        
        // Clear progress update timer
        if (progressUpdateRef.current) {
          clearInterval(progressUpdateRef.current);
          progressUpdateRef.current = null;
        }
      };
      
      // Seek to start time if specified (for resume functionality)
      if (startTime > 0) {
        audio.currentTime = startTime / 1000; // Convert milliseconds to seconds
      }
      
      // Start playing
      await audio.play();
      
    } catch (error) {
      console.error('Azure TTS Error:', error);
      alert('Failed to generate speech with Azure TTS');
      setReadingArticleId(null);
      setIsPaused(false);
    }
  };

  // Function to start reading from a specific token (for clicking on words or scrubber)
  const startReadingFromToken = async (articleId: number, content: string, words: Word[], tokenIndex: number) => {
    // Stop any current audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
    }
    
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    
    // For now, just start from the beginning - could be enhanced to estimate time position
    // Future enhancement: use tokenIndex to calculate approximate start time
    console.log('Starting from token index:', tokenIndex);
    await readParagraph(articleId, content, words, 0);
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
          {localTextVariant === 'simplified' ? '繁' : '简'}
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
                    {readingArticleId === article.id && currentAudio ? (
                      currentAudio.paused ? (
                        <>
                          <span style={{ color: 'rgb(255, 193, 7)' }}>⏸️</span>
                          <span style={{ color: 'rgb(255, 193, 7)' }}>Paused</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: 'rgb(34, 197, 94)' }}>🎵</span>
                          <span style={{ color: 'rgb(34, 197, 94)' }}>Playing</span>
                        </>
                      )
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

              {/* Stable Audio Progress Bar - Always Present */}
              <div style={{ 
                marginBottom: 16, 
                padding: readingArticleId === article.id ? '12px 16px' : '8px 16px',
                background: readingArticleId === article.id 
                  ? 'rgba(34, 197, 94, 0.05)' 
                  : 'rgba(128, 128, 128, 0.02)', 
                borderRadius: 8, 
                border: readingArticleId === article.id 
                  ? '1px solid rgba(34, 197, 94, 0.2)' 
                  : '1px solid rgba(255, 255, 255, 0.05)',
                transition: 'all 0.3s ease'
              }}>
                {/* Audio Controls and Progress */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: readingArticleId === article.id ? 8 : 0 }}>
                  {/* Play/Pause Button */}
                  <button
                    onClick={() => readParagraph(article.id, article.content, article.words)}
                    disabled={!voicesLoaded}
                    style={{
                      padding: '6px 10px',
                      background: !voicesLoaded 
                        ? 'rgba(128, 128, 128, 0.1)' 
                        : readingArticleId === article.id && currentAudio && !isPaused
                        ? 'rgba(255, 193, 7, 0.1)' // Yellow for pause
                        : 'rgba(34, 197, 94, 0.1)', // Green for play
                      border: `1px solid ${!voicesLoaded 
                        ? 'rgba(128, 128, 128, 0.3)'
                        : readingArticleId === article.id && currentAudio && !isPaused
                        ? 'rgb(255, 193, 7)'
                        : 'rgb(34, 197, 94)'}`,
                      borderRadius: 4,
                      fontSize: '0.8em',
                      cursor: voicesLoaded ? 'pointer' : 'not-allowed',
                      opacity: voicesLoaded ? 1 : 0.6,
                      color: !voicesLoaded 
                        ? 'rgba(128, 128, 128, 0.7)'
                        : readingArticleId === article.id && currentAudio && !isPaused
                        ? 'rgb(255, 193, 7)'
                        : 'rgb(34, 197, 94)',
                      fontWeight: 500,
                      minWidth: '36px',
                      height: '28px'
                    }}
                    title={
                      !voicesLoaded
                        ? 'TTS Loading...'
                        : readingArticleId === article.id && currentAudio && !isPaused 
                        ? 'Pause audio' 
                        : readingArticleId === article.id && currentAudio && isPaused
                        ? 'Resume audio'
                        : 'Play article audio'
                    }
                  >
                    {!voicesLoaded 
                      ? '⏳'
                      : readingArticleId === article.id && currentAudio && !isPaused
                      ? '⏸️' 
                      : '▶️'}
                  </button>

                  {/* Stop Button */}
                  <button
                    onClick={() => {
                      if (currentAudio) {
                        currentAudio.pause();
                        currentAudio.currentTime = 0;
                        setCurrentAudio(null);
                      }
                      if (progressUpdateRef.current) {
                        clearInterval(progressUpdateRef.current);
                        progressUpdateRef.current = null;
                      }
                      setReadingArticleId(null);
                      setActiveWordIndex(-1);
                      setHighlightedTokenIndex(-1);
                      setIsPaused(false);
                      setCurrentAudioTime(0);
                      setAudioDuration(0);
                    }}
                    disabled={readingArticleId !== article.id}
                    style={{
                      padding: '6px 8px',
                      background: readingArticleId === article.id 
                        ? 'rgba(220, 38, 38, 0.1)' 
                        : 'rgba(128, 128, 128, 0.05)',
                      border: readingArticleId === article.id 
                        ? '1px solid rgb(220, 38, 38)' 
                        : '1px solid rgba(128, 128, 128, 0.3)',
                      borderRadius: 4,
                      fontSize: '0.8em',
                      cursor: readingArticleId === article.id ? 'pointer' : 'not-allowed',
                      color: readingArticleId === article.id 
                        ? 'rgb(220, 38, 38)' 
                        : 'rgba(128, 128, 128, 0.5)',
                      fontWeight: 500,
                      opacity: readingArticleId === article.id ? 1 : 0.5,
                      minWidth: '28px',
                      height: '28px'
                    }}
                    title={readingArticleId === article.id ? "Stop audio" : "No audio playing"}
                  >
                    ⏹️
                  </button>

                  {/* Time/Progress Display */}
                  <span style={{ 
                    fontSize: '0.8em', 
                    color: readingArticleId === article.id ? 'rgb(34, 197, 94)' : 'var(--muted-color)', 
                    minWidth: '80px',
                    fontFamily: 'monospace',
                    fontWeight: readingArticleId === article.id ? 500 : 400
                  }}>
                    {readingArticleId === article.id && currentAudio ? (
                      audioDuration > 0 ? 
                        `${Math.floor(currentAudioTime)}s / ${Math.floor(audioDuration)}s` :
                        totalTokens > 0 ? 
                        `Word ${Math.max(1, highlightedTokenIndex + 1)}/${totalTokens}` :
                        'Playing...'
                    ) : readingArticleId === article.id ? 
                      'Loading...' : 
                      'Ready'
                    }
                  </span>
                  
                  <div 
                    style={{ 
                      flex: 1, 
                      height: readingArticleId === article.id ? '6px' : '3px', 
                      background: 'rgba(255, 255, 255, 0.15)', 
                      borderRadius: '3px', 
                      position: 'relative',
                      cursor: readingArticleId === article.id ? 'pointer' : 'default',
                      transition: 'height 0.3s ease'
                    }}
                    onClick={(e) => {
                      if (currentAudio && readingArticleId === article.id && audioDuration > 0) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const percentage = clickX / rect.width;
                        const targetTime = percentage * audioDuration;
                        
                        currentAudio.currentTime = targetTime;
                        setCurrentAudioTime(targetTime);
                        
                        if (currentAudio.paused) {
                          setIsPaused(true);
                        }
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (readingArticleId === article.id) {
                        e.currentTarget.style.height = '8px';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (readingArticleId === article.id) {
                        e.currentTarget.style.height = '6px';
                      }
                    }}
                  >
                    {/* Progress fill */}
                    <div 
                      style={{ 
                        width: readingArticleId === article.id && currentAudio ? (
                          audioDuration > 0 ?
                            `${Math.max(0, Math.min(100, (currentAudioTime / audioDuration) * 100))}%` :
                            totalTokens > 0 ?
                            `${Math.max(0, Math.min(100, ((highlightedTokenIndex + 1) / totalTokens) * 100))}%` :
                            '0%'
                        ) : '0%',
                        height: '100%', 
                        background: readingArticleId === article.id && currentAudio ? 
                          (currentAudio.paused ?
                            'linear-gradient(90deg, rgb(255, 193, 7) 0%, rgba(255, 193, 7, 0.7) 100%)' :
                            'linear-gradient(90deg, rgb(34, 197, 94) 0%, rgba(34, 197, 94, 0.7) 100%)'
                          ) :
                          readingArticleId === article.id ?
                          'rgba(128, 128, 128, 0.5)' :
                          'rgba(128, 128, 128, 0.3)',
                        borderRadius: '3px',
                        transition: 'width 0.2s ease, background 0.3s ease',
                        position: 'relative'
                      }}
                    >
                      {/* Scrubber handle - only when active */}
                      {readingArticleId === article.id && (
                        <div 
                          style={{ 
                            position: 'absolute', 
                            right: '-4px', 
                            top: '50%', 
                            transform: 'translateY(-50%)', 
                            width: '8px', 
                            height: '8px', 
                            background: 'white', 
                            borderRadius: '50%',
                            border: '1px solid rgba(0,0,0,0.2)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            transition: 'transform 0.2s ease'
                          }}
                        />
                      )}
                    </div>
                  </div>
                  
                  <span style={{ 
                    fontSize: '0.75em', 
                    color: readingArticleId === article.id ? 'rgb(34, 197, 94)' : 'var(--muted-color)', 
                    minWidth: '35px', 
                    textAlign: 'right',
                    fontWeight: readingArticleId === article.id ? 500 : 400
                  }}>
                    {readingArticleId === article.id && currentAudio ? (
                      audioDuration > 0 ?
                        Math.round((currentAudioTime / audioDuration) * 100) :
                        totalTokens > 0 ?
                        Math.round(((highlightedTokenIndex + 1) / totalTokens) * 100) :
                        0
                    ) : 0}%
                  </span>
                </div>
                
                {/* Expanded Controls - Only when active */}
                {readingArticleId === article.id && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    fontSize: '0.75em',
                    color: 'var(--muted-color)',
                    borderTop: '1px solid rgba(34, 197, 94, 0.1)',
                    paddingTop: 8,
                    marginTop: 4
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span>Speed: {speechRate}x</span>
                      <span>Voice: {selectedVoice.replace('zh-CN-', '').replace('Neural', '') || 'Default'}</span>
                    </div>
                    <div>
                      {currentAudio ? (
                        currentAudio.paused ? '⏸️ Paused' : '🎵 Playing'
                      ) : '⏳ Loading'}
                    </div>
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
                segments={audioSegments}
                activeWordIndex={readingArticleId === article.id ? activeWordIndex : -1}
                textVariant={localTextVariant}
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
