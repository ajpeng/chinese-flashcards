import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useTheme from '../theme'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect, useRef } from 'react'

function NavBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const { user, logout } = useAuth()
  const [showSettings, setShowSettings] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Reset dropdowns when location changes
  useEffect(() => {
    setShowSettings(false)
    setMenuOpen(false)
  }, [location.pathname])

  // Close mobile menu / settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const outsideMobile = !menuRef.current || !menuRef.current.contains(target)
      const outsideUserMenu = !userMenuRef.current || !userMenuRef.current.contains(target)
      if (outsideMobile) setMenuOpen(false)
      if (outsideUserMenu) setShowSettings(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const activeBg = 'rgba(97, 0, 0, 0.08)'

  const navLinkStyle = (path: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 12px',
    borderRadius: '4px',
    textDecoration: 'none',
    color: isActive(path) ? 'var(--primary)' : 'var(--muted-color)',
    backgroundColor: isActive(path) ? activeBg : 'transparent',
    fontSize: 14,
    fontWeight: isActive(path) ? 600 : 400,
    fontFamily: "'Manrope', system-ui, sans-serif",
    whiteSpace: 'nowrap',
    transition: 'color 0.15s, background-color 0.15s',
  })

  const navLinks = (
    <>
      <Link to="/articles" style={navLinkStyle('/articles')}>
        <span style={{ fontSize: 17 }}>📚</span> Articles
      </Link>
      <Link to="/flashcards" style={navLinkStyle('/flashcards')}>
        <span style={{ fontSize: 17 }}>🃏</span> Flashcards
      </Link>
      <Link to="/speech-practice" style={navLinkStyle('/speech-practice')}>
        <span style={{ fontSize: 17 }}>🎤</span> Speech Practice
      </Link>
      <Link to="/subtitles" style={navLinkStyle('/subtitles')}>
        <span style={{ fontSize: 17 }}>💬</span> Subtitles
      </Link>
      <Link to="/podcasts" style={navLinkStyle('/podcasts')}>
        <span style={{ fontSize: 17 }}>🎙</span> Podcasts
      </Link>
      {user && (
        <Link to="/new" style={navLinkStyle('/new')}>
          <span style={{ fontSize: 17 }}>✏️</span> New Article
        </Link>
      )}
    </>
  )

  return (
    <>
      {/* Inject responsive styles */}
      <style>{`
        .navbar-desktop-nav { display: flex; }
        .navbar-hamburger { display: none; }
        .navbar-mobile-menu { display: none; }

        @media (max-width: 900px) {
          .navbar-desktop-nav { display: none; }
          .navbar-hamburger { display: flex; }
          .navbar-mobile-menu.open { display: flex; }
          .navbar-title { display: none; }
        }
      `}</style>

      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 20px',
          backgroundColor: 'var(--surface-container-low)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 1px 0 rgba(97, 0, 0, 0.08), 0 2px 16px rgba(27, 28, 26, 0.07)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', flexShrink: 0 }}>
          <span style={{
            fontSize: 26,
            lineHeight: 1,
            background: 'linear-gradient(135deg, #610000, #8b0000)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontWeight: 800,
          }}>中</span>
          <h1 className="navbar-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>MandarinKit</h1>
        </Link>

        {/* Desktop nav links */}
        <nav className="navbar-desktop-nav" style={{ marginLeft: 'auto', gap: 4, alignItems: 'center' }}>
          {navLinks}

          {/* Theme toggle */}
          <button
            type="button"
            aria-label={`Theme: ${theme}`}
            title={`Theme: ${theme}`}
            onClick={cycleTheme}
            style={{
              border: 'none',
              padding: '8px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              backgroundColor: 'var(--surface-container)',
              color: 'inherit',
              fontSize: 17,
              display: 'flex',
              alignItems: 'center',
              minHeight: 40,
            }}
          >
            {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '💻'}
          </button>

          {/* User menu / Login */}
          {user ? (
            <div ref={userMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={showSettings}
                aria-controls="settings-menu"
                onClick={() => setShowSettings(s => !s)}
                style={{
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  backgroundColor: 'var(--surface-container)',
                  color: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 40,
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 14,
                }}
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
                    borderRadius: 8,
                    padding: '8px 0',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 140,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                  }}
                >
                  <Link
                    to="/settings"
                    role="menuitem"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', textDecoration: 'none', color: 'inherit', borderRadius: 4, margin: '2px 4px' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(97,0,0,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span style={{ fontSize: 16 }}>⚙️</span> Settings
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', padding: '8px 16px', backgroundColor: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 4, margin: '2px 4px', fontSize: 14 }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(220,38,38,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span style={{ fontSize: 16 }}>🚪</span> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <a
              href={`${(import.meta as any).env.VITE_API_URL || 'https://api.ajpeng.ca'}/api/auth/patreon`}
              title="Login with Patreon"
              aria-label="Login with Patreon"
              style={{
                border: 'none',
                padding: '8px 14px',
                borderRadius: 6,
                cursor: 'pointer',
                backgroundColor: 'var(--surface-container)',
                color: 'inherit',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 40,
                fontSize: 14,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 569 546" width="15" height="15" aria-hidden="true">
                <circle cx="363" cy="205" r="205" fill="#FF424D" />
                <rect x="0" y="0" width="112" height="546" fill="#052D49" />
              </svg>
              Login
            </a>
          )}
        </nav>

        {/* Mobile right side: theme + hamburger */}
        <div className="navbar-hamburger" style={{ marginLeft: 'auto', alignItems: 'center', gap: 8 }} ref={menuRef}>
          {/* Theme toggle */}
          <button
            type="button"
            aria-label={`Theme: ${theme}`}
            onClick={cycleTheme}
            style={{
              border: 'none',
              padding: '8px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              backgroundColor: 'var(--surface-container)',
              color: 'inherit',
              fontSize: 17,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '💻'}
          </button>

          {/* Hamburger button */}
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
            style={{
              border: 'none',
              padding: '8px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              backgroundColor: menuOpen ? activeBg : 'var(--surface-container)',
              color: 'inherit',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 4,
              width: 40,
              height: 40,
            }}
          >
            <span style={{ display: 'block', width: 18, height: 2, backgroundColor: 'currentColor', borderRadius: 2, transition: 'transform 0.2s', transform: menuOpen ? 'translateY(6px) rotate(45deg)' : 'none' }} />
            <span style={{ display: 'block', width: 18, height: 2, backgroundColor: 'currentColor', borderRadius: 2, opacity: menuOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
            <span style={{ display: 'block', width: 18, height: 2, backgroundColor: 'currentColor', borderRadius: 2, transition: 'transform 0.2s', transform: menuOpen ? 'translateY(-6px) rotate(-45deg)' : 'none' }} />
          </button>

          {/* Mobile dropdown menu */}
          <div
            className={`navbar-mobile-menu${menuOpen ? ' open' : ''}`}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: 'var(--surface-container-low)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderBottom: '1px solid var(--border-color)',
              boxShadow: '0 4px 16px rgba(27, 28, 26, 0.08)',
              flexDirection: 'column',
              padding: '8px 12px 12px',
              gap: 4,
              zIndex: 999,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
          >
            {navLinks}

            <div style={{ height: 1, backgroundColor: 'var(--border-color)', margin: '8px 0' }} />

            {user ? (
              <>
                <Link
                  to="/settings"
                  style={{ ...navLinkStyle('/settings') }}
                >
                  <span style={{ fontSize: 17 }}>⚙️</span> Settings
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    // borderRadius: 6,
                    // border: 'none',
                    backgroundColor: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    fontSize: 15,
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <span style={{ fontSize: 17 }}>🚪</span> Logout
                </button>
              </>
            ) : (
              <a
                href={`${(import.meta as any).env.VITE_API_URL || 'https://api.ajpeng.ca'}/api/auth/patreon`}
                style={{ ...navLinkStyle(''), justifyContent: 'flex-start' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 569 546" width="16" height="16" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <circle cx="363" cy="205" r="205" fill="#FF424D" />
                  <rect x="0" y="0" width="112" height="546" fill="#052D49" />
                </svg>
                Login with Patreon
              </a>
            )}
          </div>
        </div>
      </header>
    </>
  )
}

export default NavBar
