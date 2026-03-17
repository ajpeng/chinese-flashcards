import './App.css'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import Health from './pages/Health'
import Articles from './pages/Articles'
import SegmentArticle from './pages/SegmentArticle'
import SpeechPractice from './pages/SpeechPractice'
import Settings from './pages/Settings'
import Flashcards from './pages/Flashcards'
import WordDetail from './pages/WordDetail'
import Subtitles from './pages/Subtitles'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import NavBar from './components/NavBar'

const FEATURES = [
  {
    icon: '📚',
    title: 'Interactive Articles',
    description: 'Read real Chinese text with instant word definitions. Tap any word to hear pronunciation and see pinyin.',
    href: '/articles',
    label: 'Browse Articles',
    color: 'rgba(59, 130, 246, 0.85)',
    accent: 'rgba(59, 130, 246, 0.12)',
  },
  {
    icon: '🃏',
    title: 'HSK Flashcard Decks',
    description: 'Master all 5,000 HSK vocabulary words with spaced repetition. Six levels from beginner to proficient.',
    href: '/flashcards',
    label: 'Start Studying',
    color: 'rgba(168, 85, 247, 0.85)',
    accent: 'rgba(168, 85, 247, 0.12)',
  },
  {
    icon: '🎤',
    title: 'Speech Practice',
    description: 'Practice speaking and train your ear with high-quality Azure neural voices at adjustable speeds.',
    href: '/speech-practice',
    label: 'Practice Speaking',
    color: 'rgba(16, 185, 129, 0.85)',
    accent: 'rgba(16, 185, 129, 0.12)',
  },
]

function Home() {
  return (
    <div className="home">
      {/* Hero */}
      <div className="home-hero">
        <div className="home-hero-char" aria-hidden="true">中</div>
        <h1 className="home-hero-title">Chinese Flashcards</h1>
        <p className="home-hero-sub">
          Master Mandarin with interactive articles, spaced-repetition flashcards,
          and AI-powered speech practice — all in one place.
        </p>
        <div className="home-hero-actions">
          <Link to="/articles" className="home-btn home-btn-primary">Get Started →</Link>
          <Link to="/flashcards" className="home-btn home-btn-secondary">View HSK Decks</Link>
        </div>
      </div>

      {/* Feature cards */}
      <div className="home-features">
        {FEATURES.map(f => (
          <div key={f.href} className="home-feature-card" style={{ '--accent': f.accent } as React.CSSProperties}>
            <div className="home-feature-icon" style={{ background: f.accent }}>
              <span>{f.icon}</span>
            </div>
            <h3 className="home-feature-title">{f.title}</h3>
            <p className="home-feature-desc">{f.description}</p>
            <Link
              to={f.href}
              className="home-feature-link"
              style={{ color: f.color }}
            >
              {f.label} →
            </Link>
          </div>
        ))}
      </div>

      {/* Stats strip */}
      <div className="home-stats">
        {[
          { value: '5,000+', label: 'HSK Vocabulary Words' },
          { value: '6', label: 'HSK Levels' },
          { value: '∞', label: 'Spaced Repetition Sessions' },
        ].map(s => (
          <div key={s.label} className="home-stat">
            <div className="home-stat-value">{s.value}</div>
            <div className="home-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Layout() {
  const navigate = useNavigate()

  return (
    <div className="App">
      <NavBar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/speech-practice" element={<SpeechPractice />} />
          <Route path="/new" element={
            <ProtectedRoute>
              <SegmentArticle onNavigateBack={() => navigate('/articles')} />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />
          <Route path="/flashcards" element={
            <ProtectedRoute>
              <Flashcards />
            </ProtectedRoute>
          } />
          <Route path="/words/:word" element={<WordDetail />} />
          <Route path="/subtitles" element={<Subtitles />} />
          <Route path="/health" element={<Health />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter basename="/chinese-flashcards">
      <AuthProvider>
        <Layout />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
