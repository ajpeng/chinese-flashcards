import React from 'react';
import { Link } from 'react-router-dom';
import { convertPinyinStyle } from '../utils/pinyin';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.ajpeng.ca';

export type LookedUpWord = {
  simplified: string;
  pinyin: string;
  english: string;
  hskLevel: number | null;
};

const HSK_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'rgba(16,185,129,0.12)', text: 'rgb(16,185,129)', border: 'rgba(16,185,129,0.3)' },
  2: { bg: 'rgba(59,130,246,0.12)', text: 'rgb(59,130,246)', border: 'rgba(59,130,246,0.3)' },
  3: { bg: 'rgba(168,85,247,0.12)', text: 'rgb(168,85,247)', border: 'rgba(168,85,247,0.3)' },
  4: { bg: 'rgba(245,158,11,0.12)', text: 'rgb(245,158,11)', border: 'rgba(245,158,11,0.3)' },
  5: { bg: 'rgba(239,68,68,0.12)', text: 'rgb(239,68,68)', border: 'rgba(239,68,68,0.3)' },
  6: { bg: 'rgba(236,72,153,0.12)', text: 'rgb(236,72,153)', border: 'rgba(236,72,153,0.3)' },
};

interface WordDrawerProps {
  word: LookedUpWord | null;
  pinyinStyle?: 'marks' | 'numbers';
  onClose: () => void;
}

export default function WordDrawer({ word, pinyinStyle = 'marks', onClose }: WordDrawerProps) {
  const isOpen = !!word;
  const hskLevel = word?.hskLevel ?? null;
  const c = hskLevel
    ? (HSK_COLORS[hskLevel] ?? HSK_COLORS[1])
    : { bg: 'rgba(128,128,128,0.12)', text: 'rgb(128,128,128)', border: 'rgba(128,128,128,0.3)' };

  const speak = async (text: string) => {
    try {
      const res = await fetch(`${API_URL}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      new Audio(data.audioUrl).play();
    } catch {}
  };

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'transparent' }}
        />
      )}
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
            {/* Character + pinyin */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => speak(word.simplified)}
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
                  display: 'inline-flex', alignItems: 'center',
                  marginTop: 10, padding: '3px 10px', borderRadius: 99,
                  background: c.bg, border: `1px solid ${c.border}`,
                  fontSize: 11, fontWeight: 700, color: c.text, letterSpacing: '0.04em',
                }}>
                  HSK {hskLevel}
                </div>
              ) : (
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  marginTop: 10, padding: '3px 10px', borderRadius: 99,
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

            {/* Links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link
                to={`/words/${encodeURIComponent(word.simplified)}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', padding: '10px 0', borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--muted-color)',
                  fontSize: 13, fontWeight: 600,
                  textDecoration: 'none',
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
