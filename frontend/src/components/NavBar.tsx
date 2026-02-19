import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useTheme from '../theme'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect } from 'react'

function NavBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const { user, logout, loginWithPatreon } = useAuth()
  const [showSettings, setShowSettings] = useState(false)

  // Reset dropdown when location changes (navigation)
  useEffect(() => {
    setShowSettings(false)
  }, [location.pathname])

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const isActive = (path: string) => location.pathname === path

  const baseButtonStyle: React.CSSProperties = {
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'inherit',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minHeight: '40px',
  }

  const activeBg = 'rgba(59, 130, 246, 0.2)'

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 32px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        backgroundColor: 'rgba(0, 0, 0, 0.2)'
      }}
    >
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: '32px' }}>中</span>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Chinese Flashcards</h1>
      </Link>

      <nav style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link
          to="/articles"
          aria-current={isActive('/articles') ? 'page' : undefined}
          style={{ ...baseButtonStyle, backgroundColor: isActive('/articles') ? activeBg : baseButtonStyle.backgroundColor }}
        >
          📚 Articles
        </Link>

        {user && (
          <Link
            to="/new"
            aria-current={isActive('/new') ? 'page' : undefined}
            style={{ ...baseButtonStyle, backgroundColor: isActive('/new') ? activeBg : baseButtonStyle.backgroundColor }}
          >
            ✏️ New Article
          </Link>
        )}

        <Link
          to="/flashcards"
          aria-current={isActive('/flashcards') ? 'page' : undefined}
          style={{ ...baseButtonStyle, backgroundColor: isActive('/flashcards') ? activeBg : baseButtonStyle.backgroundColor }}
        >
          🃏 Flashcards
        </Link>

        <Link
          to="/speech-practice"
          aria-current={isActive('/speech-practice') ? 'page' : undefined}
          style={{ ...baseButtonStyle, backgroundColor: isActive('/speech-practice') ? activeBg : baseButtonStyle.backgroundColor }}
        >
          🎤 Speech Practice
        </Link>

     

        {user ? (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={showSettings}
              aria-controls="settings-menu"
              onClick={() => setShowSettings(!showSettings)}
              style={{ ...baseButtonStyle }}
            >
              {user.name || user.email}
            </button>

            {showSettings && (
              <div
                id="settings-menu"
                role="menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  backgroundColor: 'var(--bg-color, white)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px 0',
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: '120px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  zIndex: 1000
                }}
              >
                <Link
                  to="/settings"
                  role="menuitem"
                  style={{
                    display: 'block',
                    padding: '8px 16px',
                    textDecoration: 'none',
                    color: 'inherit',
                    borderRadius: '4px',
                    margin: '2px 4px',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(100, 108, 255, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  Settings
                </Link>

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  style={{
                    display: 'block',
                    border: 'none',
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    margin: '2px 4px',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={loginWithPatreon}
            title="Login with Patreon"
            aria-label="Login with Patreon"
            style={{ ...baseButtonStyle, padding: '6px', justifyContent: 'center', minWidth: '44px' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 569 546" width="20" height="20" aria-hidden="true">
              <circle cx="363" cy="205" r="205" fill="#FF424D" />
              <rect x="0" y="0" width="112" height="546" fill="#052D49" />
            </svg>
          </button>
        )}

        <button
          type="button"
          aria-label="Toggle theme"
          title={`Theme: ${theme}`}
          onClick={cycleTheme}
          style={{ ...baseButtonStyle, justifyContent: 'center', minWidth: '44px' }}
        >
          {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '💻'}
        </button>
      </nav>
    </header>
  )
}

export default NavBar
