import React, { useState, useEffect } from 'react';
import BrowserSTT from '../components/BrowserSTT';

interface STTResponse {
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
}

// Token-level alignment using dynamic programming (Wagner-Fischer).
// Returns a diff of {expected, got, status} for each aligned pair.
type DiffToken = { expected: string; got: string | null; status: 'correct' | 'wrong' | 'missing' | 'extra' };

function alignTokens(expected: string[], got: string[]): DiffToken[] {
  const m = expected.length;
  const n = got.length;

  // Build DP table for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = expected[i - 1] === got[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build alignment
  const result: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1] === got[j - 1]) {
      result.unshift({ expected: expected[i - 1], got: got[j - 1], status: 'correct' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ expected: '', got: got[j - 1], status: 'extra' });
      j--;
    } else {
      result.unshift({ expected: expected[i - 1], got: null, status: 'missing' });
      i--;
    }
  }

  // Merge adjacent missing+extra into substitution pairs
  const merged: DiffToken[] = [];
  let k = 0;
  while (k < result.length) {
    const cur = result[k];
    const nxt = result[k + 1];
    if (cur.status === 'missing' && nxt && nxt.status === 'extra') {
      merged.push({ expected: cur.expected, got: nxt.got, status: 'wrong' });
      k += 2;
    } else {
      merged.push(cur);
      k++;
    }
  }
  return merged;
}

function tokenizeForDiff(text: string): string[] {
  // Strip punctuation, split into individual chars
  return text.replace(/[。！？；，、：""''《》（）【】\s]/g, '').split('');
}

const exampleTexts = [
  '你好，欢迎来到中文学习平台！',
  '今天天气很好，我们去公园散步吧。',
  '我喜欢学习中文，因为中文很有趣。',
  '请问，最近的地铁站在哪里？',
  '谢谢你的帮助，我很感激。',
];

export default function SpeechPractice(): React.ReactElement {
  useEffect(() => {
    document.title = 'Speech Practice · MandarinKit';
    return () => { document.title = 'MandarinKit'; };
  }, []);

  const [transcriptionResult, setTranscriptionResult] = useState<string>('');
  const [practiceText, setPracticeText] = useState<string>('你好，欢迎来到中文学习平台！今天我们要练习说中文。请大声朗读这些句子，然后检查你的发音是否准确。');
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [tempText, setTempText] = useState<string>('');
  const [diff, setDiff] = useState<DiffToken[] | null>(null);

  const handleTranscription = (result: STTResponse) => {
    setTranscriptionResult(result.text);
    // Auto-run diff when result arrives
    const expected = tokenizeForDiff(practiceText);
    const got = tokenizeForDiff(result.text);
    setDiff(alignTokens(expected, got));
  };

  const handleSTTError = (error: string) => {
    console.error('STT Error:', error);
    alert(`Speech recognition error: ${error}`);
  };

  const handleTextEdit = () => {
    if (isEditingText) {
      setPracticeText(tempText);
      setIsEditingText(false);
      setTranscriptionResult('');
      setDiff(null);
    } else {
      setTempText(practiceText);
      setIsEditingText(true);
    }
  };

  const cancelTextEdit = () => {
    setTempText('');
    setIsEditingText(false);
  };

  const clearSession = () => {
    setTranscriptionResult('');
    setDiff(null);
  };

  // Compute score from diff
  const score = diff
    ? Math.round((diff.filter(d => d.status === 'correct').length / Math.max(1, tokenizeForDiff(practiceText).length)) * 100)
    : null;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'clamp(20px,4vw,26px)', fontWeight: 700, letterSpacing: '-0.02em' }}>
        Speech Practice
      </h2>
      <p style={{ color: 'var(--muted-color)', marginBottom: 28, fontSize: 13 }}>
        Read the text aloud, then see exactly which characters you got right.
      </p>

      {/* Practice Text */}
      <div style={{
        marginBottom: 20,
        padding: '18px 20px',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        background: 'var(--card-bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-color)' }}>
            Practice Text
          </span>
          <button
            onClick={handleTextEdit}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'transparent',
              border: `1px solid ${isEditingText ? 'rgba(220,38,38,0.5)' : 'var(--border-color)'}`,
              color: isEditingText ? 'rgb(220,38,38)' : 'var(--muted-color)',
            }}
          >
            {isEditingText ? 'Save' : 'Edit'}
          </button>
        </div>

        {isEditingText ? (
          <>
            <textarea
              value={tempText}
              onChange={(e) => setTempText(e.target.value)}
              placeholder="Enter Chinese text to practice..."
              autoFocus
              style={{
                width: '100%', minHeight: 90, fontSize: '1.15em', lineHeight: 1.8,
                padding: 12, borderRadius: 8, resize: 'vertical',
                background: 'var(--bg-secondary, rgba(128,128,128,0.06))',
                border: '1px solid rgba(100,108,255,0.4)',
                color: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={cancelTextEdit} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--muted-color)' }}>
                Cancel
              </button>
              {exampleTexts.map((text, i) => (
                <button
                  key={i}
                  onClick={() => setTempText(text)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
                    color: 'rgb(34,197,94)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  title={text}
                >
                  {text.length > 18 ? text.slice(0, 18) + '…' : text}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '1.3em', lineHeight: 2, letterSpacing: '0.03em' }}>
            {practiceText}
          </div>
        )}
      </div>

      {/* Recording */}
      <div style={{ marginBottom: 20 }}>
        <BrowserSTT
          onTranscription={handleTranscription}
          onError={handleSTTError}
          language="zh-CN"
        />
      </div>

      {/* Pronunciation diff result */}
      {diff && (
        <div style={{
          marginBottom: 20,
          padding: '18px 20px',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          background: 'var(--card-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-color)' }}>
              Result
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Score pill */}
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 99,
                background: score! >= 90 ? 'rgba(16,185,129,0.15)' : score! >= 70 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                color: score! >= 90 ? 'rgb(16,185,129)' : score! >= 70 ? 'rgb(245,158,11)' : 'rgb(239,68,68)',
                border: `1px solid ${score! >= 90 ? 'rgba(16,185,129,0.3)' : score! >= 70 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                {score}%
              </span>
              <button onClick={clearSession} style={{ fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-color)' }}>
                Clear
              </button>
            </div>
          </div>

          {/* Character-by-character diff */}
          <div style={{ fontSize: '1.5em', lineHeight: 2.2, letterSpacing: '0.04em', flexWrap: 'wrap', display: 'flex', gap: '0 2px' }}>
            {diff.map((token, i) => {
              if (token.status === 'correct') {
                return (
                  <span key={i} style={{ color: 'rgb(16,185,129)', position: 'relative' }} title="Correct">
                    {token.expected}
                  </span>
                );
              }
              if (token.status === 'missing') {
                return (
                  <span key={i} title="Missing" style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ color: 'rgb(239,68,68)', textDecoration: 'underline wavy rgb(239,68,68)' }}>
                      {token.expected}
                    </span>
                    <span style={{ fontSize: '0.4em', color: 'rgb(239,68,68)', lineHeight: 1, whiteSpace: 'nowrap' }}>missed</span>
                  </span>
                );
              }
              if (token.status === 'wrong') {
                return (
                  <span key={i} title={`Expected: ${token.expected} — You said: ${token.got}`} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ color: 'rgb(245,158,11)', textDecoration: 'underline wavy rgb(245,158,11)' }}>
                      {token.expected}
                    </span>
                    <span style={{ fontSize: '0.4em', color: 'rgb(245,158,11)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                      ← {token.got}
                    </span>
                  </span>
                );
              }
              if (token.status === 'extra') {
                return (
                  <span key={i} title={`Extra: ${token.got}`} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', opacity: 0.5 }}>
                    <span style={{ color: 'var(--muted-color)', fontSize: '0.85em' }}>
                      ({token.got})
                    </span>
                  </span>
                );
              }
              return null;
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'rgb(16,185,129)', fontWeight: 700 }}>字</span> Correct
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'rgb(239,68,68)', fontWeight: 700 }}>字</span> Missed
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'rgb(245,158,11)', fontWeight: 700 }}>字</span> Wrong character
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'var(--muted-color)' }}>字</span> Extra
            </span>
          </div>

          {/* What you said */}
          {transcriptionResult && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-light)', fontSize: 13, color: 'var(--muted-color)' }}>
              You said: <span style={{ color: 'var(--text-color)' }}>{transcriptionResult}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
