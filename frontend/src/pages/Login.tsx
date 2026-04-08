import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.ajpeng.ca';
const isDev = import.meta.env.DEV;

export default function Login() {
  const { user, devLogin } = useAuth();
  const navigate = useNavigate();

  const handleDevLogin = async () => {
    await devLogin();
    navigate('/', { replace: true });
  };

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    padding: '14px 24px',
    borderRadius: 10,
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--surface-container)',
    color: 'inherit',
    fontSize: 16,
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'background-color 0.15s, border-color 0.15s',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '40px 20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <span style={{
            fontSize: 48,
            lineHeight: 1,
            background: 'linear-gradient(135deg, #610000, #8b0000)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontWeight: 800,
            display: 'block',
            marginBottom: 16,
          }}>中</span>
          <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700 }}>Sign in to MandarinKit</h1>
          <p style={{ margin: 0, color: 'var(--muted-color)', fontSize: 15 }}>
            Choose a provider to continue
          </p>
        </div>

        {/* Login options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isDev && (
            <button
              type="button"
              onClick={handleDevLogin}
              style={{
                ...btnStyle,
                border: '1px dashed rgba(128,128,128,0.4)',
                backgroundColor: 'transparent',
                color: 'var(--muted-color)',
                fontSize: 14,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(128,128,128,0.06)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
            >
              Dev Login (local only)
            </button>
          )}
          <a
            href={`${API_URL}/api/auth/google`}
            style={btnStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-container-high, rgba(0,0,0,0.06))' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-container)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.49-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.55 10.78l7.98-6.19z"/>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.55 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            </svg>
            Continue with Google
          </a>

          <a
            href={`${API_URL}/api/auth/patreon`}
            style={btnStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-container-high, rgba(0,0,0,0.06))' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-container)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 569 546" width="20" height="20" aria-hidden="true">
              <circle cx="363" cy="205" r="205" fill="#FF424D" />
              <rect x="0" y="0" width="112" height="546" fill="#052D49" />
            </svg>
            Continue with Patreon
          </a>
        </div>
      </div>
    </div>
  );
}
