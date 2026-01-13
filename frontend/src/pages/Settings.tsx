import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Settings(): React.ReactElement {
  const { user, accessToken, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [pinyinStyle, setPinyinStyle] = useState<'marks' | 'numbers'>('marks');
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');
  const [speechRate, setSpeechRate] = useState<number>(0.8);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [name, setName] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '';

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Initialize form with current user data
    setPinyinStyle(user.pinyinStyle || 'marks');
    setFontSize(user.fontSize || 'medium');
    setSpeechRate(user.speechRate || 0.8);
    setSelectedVoice(user.voiceName || '');
    setName(user.name || '');
  }, [user, navigate]);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        
        // Filter for Chinese voices only (Mandarin and Cantonese)
        const chineseVoices = voices.filter(voice => 
          voice.lang.startsWith('zh')
        );
        
        setAvailableVoices(chineseVoices);
      }
    };

    loadVoices();
    
    // Some browsers load voices asynchronously
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`${API_URL}/api/auth/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          pinyinStyle,
          fontSize,
          speechRate,
          voiceName: selectedVoice || null,
          name: name.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      await res.json();

      // Refresh user data in auth context
      if (refreshUser) {
        await refreshUser();
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h2>Profile Settings</h2>

      <form onSubmit={handleSubmit} className="card">
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Email
          </label>
          <input
            type="email"
            id="email"
            value={user.email}
            disabled
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-color)',
              background: 'var(--button-bg)',
              color: 'var(--muted-color)',
              cursor: 'not-allowed',
            }}
          />
          <small style={{ color: 'var(--muted-color)', fontSize: '0.85em' }}>
            Email cannot be changed
          </small>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="name" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-color)',
              color: 'var(--text-color)',
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Pinyin Display Style
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: pinyinStyle === 'marks' ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="pinyinStyle"
                value="marks"
                checked={pinyinStyle === 'marks'}
                onChange={() => setPinyinStyle('marks')}
                style={{ marginRight: 8 }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>Tone Marks (Accents)</div>
                <div style={{ fontSize: '0.85em', color: 'var(--muted-color)' }}>
                  Example: nǐ hǎo
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: pinyinStyle === 'numbers' ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="pinyinStyle"
                value="numbers"
                checked={pinyinStyle === 'numbers'}
                onChange={() => setPinyinStyle('numbers')}
                style={{ marginRight: 8 }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>Tone Numbers</div>
                <div style={{ fontSize: '0.85em', color: 'var(--muted-color)' }}>
                  Example: ni3 hao3
                </div>
              </div>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Font Size
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: fontSize === 'small' ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="fontSize"
                value="small"
                checked={fontSize === 'small'}
                onChange={() => setFontSize('small')}
                style={{ marginRight: 8 }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>Small</div>
                <div style={{ fontSize: '0.85em', color: 'var(--muted-color)' }}>
                  Compact text for more content on screen
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: fontSize === 'medium' ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="fontSize"
                value="medium"
                checked={fontSize === 'medium'}
                onChange={() => setFontSize('medium')}
                style={{ marginRight: 8 }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>Medium (Default)</div>
                <div style={{ fontSize: '0.85em', color: 'var(--muted-color)' }}>
                  Balanced readability
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: fontSize === 'large' ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="fontSize"
                value="large"
                checked={fontSize === 'large'}
                onChange={() => setFontSize('large')}
                style={{ marginRight: 8 }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>Large</div>
                <div style={{ fontSize: '0.85em', color: 'var(--muted-color)' }}>
                  Easier to read for studying
                </div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: fontSize === 'xlarge' ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="fontSize"
                value="xlarge"
                checked={fontSize === 'xlarge'}
                onChange={() => setFontSize('xlarge')}
                style={{ marginRight: 8 }}
              />
              <div>
                <div style={{ fontWeight: 500 }}>Extra Large</div>
                <div style={{ fontSize: '0.85em', color: 'var(--muted-color)' }}>
                  Maximum readability
                </div>
              </div>
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Speech Speed
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { value: 0.5, label: 'Slow (0.5x)' },
              { value: 0.8, label: 'Normal (0.8x)' },
              { value: 1.0, label: 'Fast (1.0x)' },
              { value: 1.2, label: 'Very Fast (1.2x)' },
              { value: 1.5, label: 'Extra Fast (1.5x)' },
              { value: 2.0, label: 'Super Fast (2.0x)' },
            ].map(({ value, label }) => (
              <label
                key={value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  background: speechRate === value ? 'rgba(100, 108, 255, 0.1)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="speechRate"
                  value={value}
                  checked={speechRate === value}
                  onChange={() => setSpeechRate(value)}
                  style={{ marginRight: 8 }}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{label}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
            Voice Selection
          </label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              fontSize: 14,
              background: 'var(--bg-color, white)',
              color: 'var(--text-color, black)'
            }}
          >
            <option value="">Default Voice</option>
            {availableVoices.map((voice, index) => (
              <option key={`${voice.name}-${index}`} value={voice.name}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
          <div style={{ fontSize: '0.85em', color: 'var(--muted-color)', marginTop: 4 }}>
            Select a Chinese voice for more natural-sounding text-to-speech when reading articles.
          </div>
        </div>

        {error && (
          <div style={{ padding: 12, marginBottom: 16, borderRadius: 6, background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div style={{ padding: 12, marginBottom: 16, borderRadius: 6, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
            Settings saved successfully!
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
          <button type="button" onClick={() => navigate('/articles')} style={{ flex: 1 }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
