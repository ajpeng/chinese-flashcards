
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useTheme from '../theme'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect } from 'react'

function NavBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()
  const { user, logout } = useAuth()
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
    navigate('/login')
  }

  const isActive = (path: string) => location.pathname === path

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '16px 32px',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      backgroundColor: 'rgba(0, 0, 0, 0.2)'
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: '32px' }}>中</span>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>Chinese Flashcards</h1>
      </Link>
      <nav style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link
          to="/articles"
          style={{
            backgroundColor: isActive('/articles') ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          Articles
        </Link>
        <Link
          to="/speech-practice"
          style={{
            backgroundColor: isActive('/speech-practice') ? 'rgba(139, 69, 19, 0.5)' : 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          🎤 Speech Practice
        </Link>
        {user && (
          <Link
            to="/new"
            style={{
              backgroundColor: isActive('/new') ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              textDecoration: 'none',
              color: 'inherit'
            }}
          >
            New Article
          </Link>
        )}
        <Link
          to="/health"
          style={{
            backgroundColor: isActive('/health') ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          Health
        </Link>
        {user ? (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                border: '1px solid rgba(255, 255, 255, 0.2)',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                color: 'inherit'
              }}
            >
              Settings
            </button>
            {showSettings && (
              <div style={{
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
              }}>
                <Link
                  to="/settings"
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
                    e.currentTarget.style.backgroundColor = 'rgba(100, 108, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Settings
                </Link>
                <button
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(220, 38, 38, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link
              to="/login"
              style={{
                backgroundColor: isActive('/login') ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                textDecoration: 'none',
                color: 'inherit'
              }}
            >
              Login
            </Link>
            <Link
              to="/signup"
              style={{
                backgroundColor: isActive('/signup') ? 'rgba(16, 185, 129, 0.5)' : 'rgba(16, 185, 129, 0.8)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                textDecoration: 'none',
                color: 'inherit',
                fontWeight: 600
              }}
            >
              Sign Up
            </Link>
          </>
        )}
        <button
          aria-label="Toggle theme"
          title={`Theme: ${theme}`}
          onClick={cycleTheme}
          style={{
            border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: 'transparent'
          }}
        >
          {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '💻'}
        </button>
      </nav>
    </header>
  )
}

export default NavBar
