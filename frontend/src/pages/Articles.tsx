import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { convertPinyinStyle } from '../utils/pinyin';
import { convertChineseText } from '../utils/chinese-conversion';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.ajpeng.ca';

export type Word = {
  id: number;
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number;
};

// A word-like object from an on-demand dictionary lookup (no DB id)
export type LookedUpWord = {
  id: -1;
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number | null;
};

export type DrawerWord = Word | LookedUpWord;

export type Article = {
  id: number;
  title: string;
  content: string;
  hskLevel: number;
  createdAt?: string;
  updatedAt?: string;
  words: Word[];
};

// lookupable=true means single Han character with no word match — can be looked up on click
type Token = { text: string; word?: Word; lookupable?: boolean };

function buildLookup(words: Word[]) {
  const map = new Map<string, Word>();
  let maxLen = 1;
  for (const w of words) {
    if (!w.english) continue; // skip words with no definition
    map.set(w.simplified, w);
    maxLen = Math.max(maxLen, w.simplified.length);
  }
  return { map, maxLen };
}

function tokenize(content: string, words: Word[]): Token[] {
  if (!content) return [];
  const { map, maxLen } = buildLookup(words || []);
  const tokens: Token[] = [];
  const isHan = (ch: string) => /[\u4E00-\u9FFF]/.test(ch);
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
      if (w) { matched = w; matchedLen = len; break; }
    }
    if (matched) {
      tokens.push({ text: content.substr(i, matchedLen), word: matched });
      i += matchedLen;
    } else {
      // Single Han character with no word match — mark as lookupable
      tokens.push({ text: ch, lookupable: true });
      i++;
    }
  }
  return tokens;
}

// ── HSK level color palette ───────────────────────────────────────────────────
const HSK_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'rgba(16,185,129,0.12)', text: 'rgb(16,185,129)', border: 'rgba(16,185,129,0.3)' },
  2: { bg: 'rgba(59,130,246,0.12)', text: 'rgb(59,130,246)', border: 'rgba(59,130,246,0.3)' },
  3: { bg: 'rgba(168,85,247,0.12)', text: 'rgb(168,85,247)', border: 'rgba(168,85,247,0.3)' },
  4: { bg: 'rgba(245,158,11,0.12)', text: 'rgb(245,158,11)', border: 'rgba(245,158,11,0.3)' },
  5: { bg: 'rgba(239,68,68,0.12)', text: 'rgb(239,68,68)', border: 'rgba(239,68,68,0.3)' },
  6: { bg: 'rgba(236,72,153,0.12)', text: 'rgb(236,72,153)', border: 'rgba(236,72,153,0.3)' },
};

function HskBadge({ level }: { level: number }) {
  const c = HSK_COLORS[level] ?? HSK_COLORS[1];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>
      HSK {level}
    </span>
  );
}

// ── Article content renderer ──────────────────────────────────────────────────
interface ArticleContentProps {
  content: string;
  words: Word[];
  showPinyin?: boolean;
  onToggle?: (wordId: number) => Promise<boolean>;
  markingSet?: Set<number>;
  savedSet?: Set<number>;
  learnedSet?: Set<number>;
  pinyinStyle?: 'marks' | 'numbers';
  fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
  highlightedTokenIndex?: number;
  selectedVoice?: string;
  speechRate?: number;
  onStartReadingFromToken?: (tokenIndex: number) => void;
  textVariant?: 'simplified' | 'traditional';
  backendTokens?: Array<{ text: string; word?: Word; index: number }>;
  wordTimings?: Array<{ word: string; start: number; duration: number; audioOffset: number }>;
  onWordClick?: (word: Word) => void;
  onCharClick?: (char: string) => void;
}

function ArticleContent({
  content, words, showPinyin = false,
  learnedSet,
  pinyinStyle = 'marks', fontSize = 'medium',
  highlightedTokenIndex = -1,
  selectedVoice = '', speechRate = 0.8,
  onStartReadingFromToken,
  textVariant = 'simplified',
  backendTokens = [], wordTimings = [],
  onWordClick,
  onCharClick,
}: ArticleContentProps) {

  const tokens = useMemo(() => {
    return backendTokens.length > 0 ? backendTokens : tokenize(content, words);
  }, [backendTokens, content, words]);

  const speak = async (text: string) => {
    try {
      const response = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: selectedVoice, rate: speechRate.toString() }),
      });
      if (!response.ok) throw new Error(`TTS request failed: ${response.statusText}`);
      const data = await response.json();
      new Audio(`data:audio/wav;base64,${data.audioData}`).play();
    } catch (error) {
      console.error('TTS Error:', error);
      alert('Failed to generate speech');
    }
  };

  const fontSizeMap: Record<string, string> = {
    small: 'clamp(16px, 3.5vw, 18px)',
    medium: 'clamp(18px, 4vw, 22px)',
    large: 'clamp(20px, 4.5vw, 26px)',
    xlarge: 'clamp(22px, 5vw, 30px)',
  };
  const fontSizeVal = fontSizeMap[fontSize] ?? fontSizeMap.medium;

  const renderItems = wordTimings.length > 0
    ? wordTimings
    : tokens.map((t, idx) => ({ word: t.text, timingIndex: idx, tokenData: t }));

  const renderToken = (
    key: string,
    text: string,
    wordData: Word | undefined,
    idx: number,
    isHighlighted: boolean,
    lookupable?: boolean,
  ) => {
    const hasWord = !!wordData;
    const isLearned = hasWord && learnedSet?.has(wordData!.id);

    const tokenEl = showPinyin ? (
      <ruby>
        {convertChineseText(text, textVariant)}
        <rt style={{ fontSize: '0.5em', color: 'var(--pinyin-color)', letterSpacing: '0.03em' }}>
          {hasWord ? convertPinyinStyle(wordData!.pinyin, pinyinStyle) : '\u00A0'}
        </rt>
      </ruby>
    ) : (
      <>{convertChineseText(text, textVariant)}</>
    );

    if (!hasWord) {
      if (lookupable && onCharClick) {
        // Single unmatched Han character — make it clickable for on-demand lookup
        return (
          <span
            key={key}
            className="word-token lookupable-char"
            style={{ cursor: 'pointer', borderBottom: '1px dotted rgba(150,150,150,0.3)', borderRadius: 2 }}
            onClick={(e) => { e.stopPropagation(); onCharClick(text); }}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const x = Math.max(70, Math.min(window.innerWidth - 70, rect.left + rect.width / 2));
              const y = rect.top - 8;
              (e.currentTarget as HTMLElement).style.setProperty('--popup-x', `${x}px`);
              (e.currentTarget as HTMLElement).style.setProperty('--popup-y', `${y}px`);
            }}
          >
            {tokenEl}
          </span>
        );
      }
      return <span key={key} style={{ whiteSpace: 'pre-wrap' }}>{tokenEl}</span>;
    }

    return (
      <span
        key={key}
        className="word-token"
        tabIndex={0}
        aria-label={`${wordData!.simplified}, pinyin ${convertPinyinStyle(wordData!.pinyin, pinyinStyle)}, ${wordData!.english}`}
        style={{
          cursor: 'pointer',
          borderRadius: 3,
          background: isHighlighted
            ? 'rgba(34,197,94,0.45)'
            : isLearned
              ? 'rgba(59,130,246,0.12)'
              : 'transparent',
          borderBottom: isLearned
            ? '2px solid rgba(59,130,246,0.4)'
            : '1px dotted rgba(150,150,150,0.5)',
          transition: 'background 0.15s',
          paddingBottom: showPinyin ? 0 : 1,
        }}
        onClick={(e) => { e.stopPropagation(); if (onWordClick) { onWordClick(wordData!); } else { speak(wordData!.simplified); } }}
        onDoubleClick={onStartReadingFromToken ? (e) => { e.stopPropagation(); onStartReadingFromToken(idx); } : undefined}
        onMouseEnter={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = Math.max(70, Math.min(window.innerWidth - 70, rect.left + rect.width / 2));
          const y = rect.top - 8;
          (e.currentTarget as HTMLElement).style.setProperty('--popup-x', `${x}px`);
          (e.currentTarget as HTMLElement).style.setProperty('--popup-y', `${y}px`);
        }}
      >
        {tokenEl}
        <span className="token-popup" role="tooltip">
          <span className="popup-pinyin">{convertPinyinStyle(wordData!.pinyin, pinyinStyle)}</span>
          <span className="popup-english">{wordData!.english}</span>
          <button type="button" className="speak-btn" onClick={(e) => { e.stopPropagation(); speak(wordData!.simplified); }} title="Listen">🔊</button>
        </span>
      </span>
    );
  };

  return (
    <div style={{
      fontSize: fontSizeVal,
      lineHeight: showPinyin ? 2.6 : 1.9,
      letterSpacing: '0.03em',
      textAlign: 'justify',
      wordBreak: 'break-word',
    }}>
      {renderItems.map((item, idx) => {
        if ('word' in item && 'start' in item) {
          const timing = item as { word: string; start: number; duration: number; audioOffset: number };
          const wordData = words.find(w => w.simplified === timing.word);
          const key = wordData ? `w-${wordData.id}-${idx}` : `t-${idx}`;
          return renderToken(key, timing.word, wordData, idx, idx === highlightedTokenIndex);
        }
        const t = (item as any).tokenData || item;
        const key = t.word ? `w-${t.word.id}-${idx}` : `t-${idx}`;
        return renderToken(key, t.text, t.word, idx, idx === highlightedTokenIndex, t.lookupable);
      })}
    </div>
  );
}


// ── Word definition drawer ────────────────────────────────────────────────────
function WordDrawer({
  word, learnedSet, markingSet, pinyinStyle, onClose, onToggle, onSpeak, onNavigate,
}: {
  word: DrawerWord | null;
  learnedSet: Set<number>;
  markingSet: Set<number>;
  pinyinStyle: 'marks' | 'numbers';
  onClose: () => void;
  onToggle: (id: number) => void;
  onSpeak: (text: string) => void;
  onNavigate: (word: DrawerWord) => void;
}) {
  const isOpen = !!word;
  const isLearned = word && word.id !== -1 ? learnedSet.has(word.id) : false;
  const isMarking = word && word.id !== -1 ? markingSet.has(word.id) : false;
  const hskLevel = word?.hskLevel;
  const c = hskLevel ? (HSK_COLORS[hskLevel] ?? HSK_COLORS[1]) : { bg: 'rgba(128,128,128,0.12)', text: 'rgb(128,128,128)', border: 'rgba(128,128,128,0.3)' };

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
              {/* Save button — only for DB words */}
              {word.id !== -1 && (
                <button
                  onClick={() => onToggle(word.id)}
                  disabled={isMarking}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', padding: '10px 0', borderRadius: 8,
                    border: `1px solid ${isLearned ? 'rgba(59,130,246,0.4)' : 'var(--border-color)'}`,
                    background: isLearned ? 'rgba(59,130,246,0.1)' : 'transparent',
                    color: isLearned ? 'rgb(59,130,246)' : 'var(--muted-color)',
                    fontSize: 13, fontWeight: 600, cursor: isMarking ? 'default' : 'pointer',
                    opacity: isMarking ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {isMarking ? '⏳ Saving…' : isLearned ? '★ Saved to flashcards' : '☆ Save to flashcards'}
                </button>
              )}

              {/* View in flashcards link — only when HSK level known */}
              {hskLevel && (
                <button
                  onClick={() => onNavigate(word)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    width: '100%', padding: '10px 0', borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--link-color)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  View in Flashcards →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Reader settings bar ───────────────────────────────────────────────────────
function SettingsBar({
  showPinyin, onTogglePinyin,
  fontSize, onFontSize,
  textVariant, onTextVariant,
  speechRate, onSpeechRate,
  selectedVoice, availableVoices, onVoice,
}: {
  showPinyin: boolean; onTogglePinyin: () => void;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge'; onFontSize: (s: 'small' | 'medium' | 'large' | 'xlarge') => void;
  textVariant: 'simplified' | 'traditional'; onTextVariant: () => void;
  speechRate: number; onSpeechRate: (r: number) => void;
  selectedVoice: string; availableVoices: string[]; onVoice: (v: string) => void;
}) {
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${active ? 'rgba(100,108,255,0.5)' : 'var(--border-color)'}`,
    background: active ? 'rgba(100,108,255,0.15)' : 'transparent',
    color: active ? 'var(--link-color)' : 'var(--muted-color)',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'all 0.15s',
  });

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      padding: '10px 16px',
      borderRadius: 10,
      border: '1px solid var(--border-color)',
      background: 'var(--card-bg)',
      marginBottom: 24,
      fontSize: 12,
    }}>
      {/* Pinyin */}
      <button onClick={onTogglePinyin} style={chip(showPinyin)} aria-pressed={showPinyin}>
        拼音 Pinyin
      </button>

      {/* Script */}
      <button onClick={onTextVariant} style={chip(false)} title="Toggle script">
        {textVariant === 'simplified' ? '繁 Traditional' : '简 Simplified'}
      </button>

      <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />

      {/* Font size */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <span style={{ color: 'var(--muted-color)', marginRight: 4 }}>A</span>
        {(['small', 'medium', 'large', 'xlarge'] as const).map((s, i) => (
          <button key={s} onClick={() => onFontSize(s)} style={{ ...chip(fontSize === s), padding: '4px 8px', fontSize: `${0.75 + i * 0.12}em` }} title={s}>A</button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border-color)' }} />

      {/* Speed */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <span style={{ color: 'var(--muted-color)', marginRight: 2 }}>Speed</span>
        {([0.5, 0.8, 1.0, 1.2, 1.5] as const).map((r) => (
          <button key={r} onClick={() => onSpeechRate(r)} style={chip(speechRate === r)}>{r}×</button>
        ))}
      </div>

      {/* Voice */}
      <select
        value={selectedVoice}
        onChange={(e) => onVoice(e.target.value)}
        style={{
          padding: '4px 8px', borderRadius: 6,
          border: '1px solid var(--border-color)',
          background: 'transparent', color: 'var(--muted-color)',
          fontSize: 12, cursor: 'pointer', maxWidth: 130,
        }}
      >
        {availableVoices.map((v, i) => (
          <option key={`${v}-${i}`} value={v}>{v.replace('zh-CN-', '').replace('Neural', '')}</option>
        ))}
      </select>
    </div>
  );
}

// ── Audio player strip ────────────────────────────────────────────────────────
function AudioStrip({
  articleId, readingArticleId, currentAudioSrc, voicesLoaded, speechRate, selectedVoice,
  onPlay, onStop,
}: {
  articleId: number;
  readingArticleId: number | null;
  currentAudioSrc: string | null;
  voicesLoaded: boolean;
  speechRate: number;
  selectedVoice: string;
  onPlay: () => void;
  onStop: () => void;
}) {
  const isThis = readingArticleId === articleId;
  const isPlaying = isThis && !!currentAudioSrc;
  const isLoading = isThis && !currentAudioSrc;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 14px', borderRadius: 10,
      border: `1px solid ${isThis ? 'rgba(34,197,94,0.25)' : 'var(--border-color)'}`,
      background: isThis ? 'rgba(34,197,94,0.04)' : 'var(--card-bg)',
      marginBottom: 20,
      transition: 'all 0.25s',
    }}>
      <button
        onClick={onPlay}
        disabled={!voicesLoaded}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8,
          border: `1px solid ${isPlaying ? 'rgba(34,197,94,0.5)' : 'rgba(59,130,246,0.4)'}`,
          background: isPlaying ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
          color: isPlaying ? 'rgb(34,197,94)' : 'rgb(59,130,246)',
          fontSize: 13, fontWeight: 600, cursor: voicesLoaded ? 'pointer' : 'not-allowed',
        }}
      >
        {isLoading ? '⏳ Generating…' : isPlaying ? '🎧 Playing' : '▶ Listen'}
      </button>

      {isThis && (
        <button
          onClick={onStop}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', borderRadius: 8,
            border: '1px solid rgba(220,38,38,0.35)',
            background: 'rgba(220,38,38,0.08)',
            color: 'rgb(220,38,38)',
            fontSize: 13, cursor: 'pointer',
          }}
        >
          ■ Stop
        </button>
      )}

      <span style={{ fontSize: 12, color: 'var(--muted-color)' }}>
        {speechRate}× · {selectedVoice.replace('zh-CN-', '').replace('Neural', '')}
      </span>

      {isPlaying && currentAudioSrc && (
        <div style={{ width: '100%', marginTop: 4 }}>
          {/* Will be populated by useRef from parent */}
          <AudioElement src={currentAudioSrc} articleId={articleId} />
        </div>
      )}
    </div>
  );
}

// Thin wrapper so we can attach the audio element directly
function AudioElement({ src, articleId }: { src: string; articleId: number }) {
  return (
    <audio
      key={`audio-${articleId}`}
      controls
      autoPlay
      src={src}
      style={{ width: '100%', height: 36, accentColor: 'rgb(34,197,94)' }}
    />
  );
}

// ── Main Articles page ────────────────────────────────────────────────────────
export default function Articles(): React.ReactElement {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Article[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openArticleId, setOpenArticleId] = useState<number | null>(null);

  // Drawer state
  const [drawerWord, setDrawerWord] = useState<DrawerWord | null>(null);
  // Cache for on-demand character lookups (simplified → LookedUpWord | null)
  const charLookupCache = React.useRef<Map<string, LookedUpWord | null>>(new Map());

  // Reader settings
  const [showPinyin, setShowPinyin] = useState(false);
  const [localFontSize, setLocalFontSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  const [localTextVariant, setLocalTextVariant] = useState<'simplified' | 'traditional'>('simplified');
  const [speechRate, setSpeechRate] = useState(0.8);
  const [selectedVoice, setSelectedVoice] = useState('zh-CN-XiaoxiaoNeural');
  const availableVoices = ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunxiaNeural', 'zh-CN-YunyangNeural'];

  // Audio state
  const [currentAudioSrc, setCurrentAudioSrc] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Array<{ text: string; word?: Word; index: number }>>([]);
  const [wordTimings, setWordTimings] = useState<Array<{ word: string; start: number; duration: number; audioOffset: number }>>([]);
  const [readingArticleId, setReadingArticleId] = useState<number | null>(null);
  const [highlightedTokenIndex, setHighlightedTokenIndex] = useState(-1);

  // Word learning state
  const [learnedIds, setLearnedIds] = useState<number[]>([]);
  const [markingIds, setMarkingIds] = useState<number[]>([]);
  const [savedIds, setSavedIds] = useState<number[]>([]);
  const learnedSet = useMemo(() => new Set(learnedIds), [learnedIds]);
  const markingSet = useMemo(() => new Set(markingIds), [markingIds]);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  const { user, accessToken, loginWithPatreon } = useAuth();
  const pinyinStyle = (user?.pinyinStyle || 'marks') as 'marks' | 'numbers';

  // ── Settings sync ───────────────────────────────────────────────────────────
  const syncSettingsToBackend = useCallback(async (settings: {
    fontSize?: 'small' | 'medium' | 'large' | 'xlarge';
    speechRate?: number;
    voiceName?: string;
    textVariant?: 'simplified' | 'traditional';
  }) => {
    if (!user || !accessToken) return;
    try {
      await fetch(`${API_URL}/api/auth/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify(settings),
      });
    } catch (err) { console.error('Error syncing settings:', err); }
  }, [user, accessToken]);

  useEffect(() => { if (user?.fontSize) setLocalFontSize(user.fontSize as any); }, [user?.fontSize]);
  useEffect(() => { if (user?.speechRate) setSpeechRate(user.speechRate); }, [user?.speechRate]);
  useEffect(() => { if (user?.voiceName) setSelectedVoice(user.voiceName); }, [user?.voiceName]);
  useEffect(() => { if (user?.textVariant) setLocalTextVariant(user.textVariant as any); }, [user?.textVariant]);

  useEffect(() => { if (user?.fontSize && localFontSize !== user.fontSize) syncSettingsToBackend({ fontSize: localFontSize }); }, [localFontSize]);
  useEffect(() => { if (user?.speechRate !== undefined && speechRate !== user.speechRate) syncSettingsToBackend({ speechRate }); }, [speechRate]);
  useEffect(() => { if (selectedVoice !== (user?.voiceName || '')) syncSettingsToBackend({ voiceName: selectedVoice }); }, [selectedVoice]);
  useEffect(() => { if (user?.textVariant && localTextVariant !== user.textVariant) syncSettingsToBackend({ textVariant: localTextVariant }); }, [localTextVariant]);

  // ── Fetch learned words ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !accessToken) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/flashcards`, {
          headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include',
        });
        if (!res.ok) return;
        const json = await res.json();
        setLearnedIds(Array.isArray(json) ? json.map((r: any) => r.wordId).filter(Number.isInteger) : []);
      } catch (err) { console.error('Failed to load learned words', err); }
    })();
  }, [user, accessToken]);

  // ── Word toggle ─────────────────────────────────────────────────────────────
  const markLearned = async (wordId: number): Promise<boolean> => {
    if (!user || !accessToken) { loginWithPatreon(); return false; }
    if (learnedSet.has(wordId) || markingSet.has(wordId)) return false;
    setMarkingIds(s => [...s, wordId]);
    try {
      const res = await fetch(`${API_URL}/api/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
        body: JSON.stringify({ wordId }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      setLearnedIds(s => s.includes(wordId) ? s : [...s, wordId]);
      return true;
    } catch (err) { console.error('Failed to mark learned', err); alert('Failed to mark word as learned'); return false; }
    finally { setMarkingIds(s => s.filter(id => id !== wordId)); }
  };

  const unlearn = async (wordId: number): Promise<boolean> => {
    if (!user || !accessToken) { loginWithPatreon(); return false; }
    if (!learnedSet.has(wordId) || markingSet.has(wordId)) return false;
    setMarkingIds(s => [...s, wordId]);
    try {
      const res = await fetch(`${API_URL}/api/flashcards/${wordId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      setLearnedIds(s => s.filter(id => id !== wordId));
      setSavedIds(s => s.filter(id => id !== wordId));
      return true;
    } catch (err) { console.error('Failed to unlearn', err); alert('Failed to unlearn word'); return false; }
    finally { setMarkingIds(s => s.filter(id => id !== wordId)); }
  };

  const toggleLearn = async (wordId: number) => {
    if (learnedSet.has(wordId)) return await unlearn(wordId);
    const ok = await markLearned(wordId);
    if (!ok) return false;
    setSavedIds(s => s.includes(wordId) ? s : [...s, wordId]);
    setTimeout(() => setSavedIds(s => s.filter(id => id !== wordId)), 1400);
    return true;
  };

  // ── TTS ─────────────────────────────────────────────────────────────────────
  const speak = async (text: string) => {
    try {
      const res = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: selectedVoice, rate: speechRate.toString() }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const data = await res.json();
      new Audio(`data:audio/wav;base64,${data.audioData}`).play();
    } catch (err) { console.error('TTS Error:', err); alert('Failed to generate speech'); }
  };

  const readArticle = async (articleId: number, content: string, words: Word[]) => {
    if (readingArticleId === articleId && currentAudioSrc) return;
    setCurrentAudioSrc(null);
    setReadingArticleId(articleId);
    setHighlightedTokenIndex(-1);
    setWordTimings([]);
    try {
      const convertedContent = convertChineseText(content, localTextVariant);
      const res = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: convertedContent, voice: selectedVoice, rate: speechRate.toString(), words }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const data = await res.json();
      setTokens(data.tokens || []);
      setWordTimings(data.timings || []);
      setCurrentAudioSrc(`data:audio/wav;base64,${data.audioData}`);
    } catch (err) {
      console.error('Azure TTS Error:', err);
      setReadingArticleId(null);
    }
  };

  const stopAudio = () => {
    setCurrentAudioSrc(null);
    setReadingArticleId(null);
    setHighlightedTokenIndex(-1);
    setWordTimings([]);
  };

  // ── Fetch articles ──────────────────────────────────────────────────────────
  const fetchArticles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/articles`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { void fetchArticles(); }, []);

  const handleWordClick = (word: Word) => {
    setDrawerWord(word);
  };

  const handleCharClick = async (char: string) => {
    const cache = charLookupCache.current;
    if (cache.has(char)) {
      const cached = cache.get(char)!;
      if (cached) setDrawerWord(cached);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/words/lookup?q=${encodeURIComponent(char)}`);
      if (!res.ok) { cache.set(char, null); return; }
      const data = await res.json();
      const entry: LookedUpWord = {
        id: -1,
        simplified: char,
        pinyin: data.pinyin || '',
        english: data.english || '',
        hskLevel: data.hskLevel || null,
      };
      cache.set(char, entry);
      setDrawerWord(entry);
    } catch { cache.set(char, null); }
  };

  const handleNavigateToFlashcard = (word: DrawerWord) => {
    if (!word.hskLevel) return;
    navigate(`/flashcards?word=${encodeURIComponent(word.simplified)}&level=${word.hskLevel}`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <WordDrawer
        word={drawerWord}
        learnedSet={learnedSet}
        markingSet={markingSet}
        pinyinStyle={pinyinStyle}
        onClose={() => setDrawerWord(null)}
        onToggle={(id) => void toggleLearn(id)}
        onSpeak={speak}
        onNavigate={handleNavigateToFlashcard}
      />
      <style>{`
        .article-card { transition: box-shadow 0.2s ease, border-color 0.2s ease; }
        .article-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
        .article-open { border-color: rgba(100,108,255,0.25) !important; }
        .article-list-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px; font-size: 13px;
          font-weight: 600; cursor: pointer; transition: all 0.15s; border: none;
        }
        .article-list-btn-primary {
          background: rgba(100,108,255,0.12);
          color: var(--link-color);
          border: 1px solid rgba(100,108,255,0.25) !important;
        }
        .article-list-btn-primary:hover { background: rgba(100,108,255,0.2); }
        .article-list-btn-ghost { background: transparent; color: var(--muted-color); border: 1px solid var(--border-color) !important; }
        .article-list-btn-ghost:hover { color: var(--text-color); border-color: var(--text-color) !important; }
        @media (max-width: 600px) {
          .reader-content { font-size: clamp(18px, 5vw, 22px) !important; }
        }
      `}</style>

      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'clamp(20px,4vw,26px)', fontWeight: 700, letterSpacing: '-0.02em' }}>Articles</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted-color)' }}>
              Click any word for definition · double-click to read from there
            </p>
          </div>
          <button onClick={fetchArticles} disabled={loading} className="article-list-btn article-list-btn-ghost" style={{ border: '1px solid var(--border-color)' }}>
            {loading ? '⟳ Loading…' : '⟳ Refresh'}
          </button>
        </div>

        {/* Settings bar — always visible */}
        <SettingsBar
          showPinyin={showPinyin} onTogglePinyin={() => setShowPinyin(s => !s)}
          fontSize={localFontSize} onFontSize={setLocalFontSize}
          textVariant={localTextVariant} onTextVariant={async () => {
            const nv = localTextVariant === 'simplified' ? 'traditional' : 'simplified';
            setLocalTextVariant(nv);
            await syncSettingsToBackend({ textVariant: nv });
          }}
          speechRate={speechRate} onSpeechRate={setSpeechRate}
          selectedVoice={selectedVoice} availableVoices={availableVoices} onVoice={setSelectedVoice}
        />

        {/* Error */}
        {error && (
          <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: 'rgb(220,38,38)', marginBottom: 16, fontSize: 14 }}>
            Failed to load articles: {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && data?.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted-color)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p>No articles found.</p>
          </div>
        )}

        {/* Article list */}
        {data && data.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.map(article => {
              const isOpen = openArticleId === article.id;
              return (
                <article
                  key={article.id}
                  className={`card article-card${isOpen ? ' article-open' : ''}`}
                  style={{ padding: 0, overflow: 'hidden' }}
                >
                  {/* Article header — always visible */}
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
                      cursor: 'pointer', userSelect: 'none',
                    }}
                    onClick={() => setOpenArticleId(isOpen ? null : article.id)}
                    role="button"
                    aria-expanded={isOpen}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                        <h3 style={{ margin: 0, fontSize: 'clamp(15px,3vw,17px)', fontWeight: 700, letterSpacing: '-0.01em' }}>
                          {article.title}
                        </h3>
                        <HskBadge level={article.hskLevel} />
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--muted-color)' }}>
                        {article.createdAt && <span>{new Date(article.createdAt).toLocaleDateString()}</span>}
                        <span>{article.words.length} words</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: 'var(--muted-color)', flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                      ↓
                    </span>
                  </div>

                  {/* Article body — only when open */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border-light)', padding: '20px 24px 24px' }}>

                      {/* Audio strip */}
                      <AudioStrip
                        articleId={article.id}
                        readingArticleId={readingArticleId}
                        currentAudioSrc={currentAudioSrc}
                        voicesLoaded={true}
                        speechRate={speechRate}
                        selectedVoice={selectedVoice}
                        onPlay={() => readArticle(article.id, article.content, article.words)}
                        onStop={stopAudio}
                      />

                      {/* Article text */}
                      <div className="reader-content">
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
                          onStartReadingFromToken={(_idx) => readArticle(article.id, article.content, article.words)}
                          textVariant={localTextVariant}
                          backendTokens={readingArticleId === article.id ? tokens : []}
                          wordTimings={readingArticleId === article.id ? wordTimings : []}
                          onWordClick={handleWordClick}
                          onCharClick={handleCharClick}
                        />
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
