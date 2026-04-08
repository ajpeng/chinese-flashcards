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
import Podcasts from './pages/Podcasts'
import PodcastEpisode from './pages/PodcastEpisode'
import Login from './pages/Login'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import NavBar from './components/NavBar'

function Home() {
  return (
    <div className="home">

      {/* Page header */}
      <div className="home-page-header">
        <div>
          <h1 className="home-page-title">Welcome to MandarinKit</h1>
          <p className="home-page-sub">Your scholarly path to Mandarin mastery.</p>
        </div>
        <Link to="/articles" className="home-btn home-btn-primary">Get Started →</Link>
      </div>

      {/* Bento grid */}
      <div className="home-bento">

        {/* Featured card — full dark primary bg, 8-col */}
        <div className="home-bento-featured">
          <div className="home-hanzi-grid-bg" aria-hidden="true" />
          <div className="home-bento-featured-inner">
            <span className="home-label-chip">Start Learning</span>
            <h2 className="home-bento-featured-title">Interactive Article Reader</h2>
            <p className="home-bento-featured-desc">
              Read real Chinese text with instant definitions. Tap any word to hear pronunciation, see pinyin, and save to your study deck.
            </p>
            <div className="home-bento-featured-actions">
              <Link to="/articles" className="home-btn-featured">Browse Articles →</Link>
              <span className="home-bento-featured-meta">HSK 1–6 · Graded reading</span>
            </div>
          </div>
          <div className="home-bento-featured-char" aria-hidden="true">文</div>
        </div>

        {/* Flashcards — 4-col */}
        <Link to="/flashcards" className="home-bento-card home-bento-card-accent">
          <span className="home-label-chip home-label-chip-light">5,000+ Words</span>
          <div className="home-bento-card-icon">🃏</div>
          <h3 className="home-bento-card-title">HSK Flashcard Decks</h3>
          <p className="home-bento-card-desc">Six levels of spaced-repetition vocabulary from beginner to proficient.</p>
          <span className="home-bento-card-link">Start Studying →</span>
        </Link>

        {/* Speech Practice — 4-col */}
        <Link to="/speech-practice" className="home-bento-card">
          <span className="home-label-chip">AI Powered</span>
          <div className="home-bento-card-icon">🎤</div>
          <h3 className="home-bento-card-title">Speech Practice</h3>
          <p className="home-bento-card-desc">Read aloud and get instant character-by-character pronunciation feedback.</p>
          <span className="home-bento-card-link">Practice Speaking →</span>
        </Link>

        {/* Character of the day — 4-col */}
        <div className="home-bento-card home-bento-char-card">
          <p className="home-bento-char-label">Character Focus</p>
          <div className="home-bento-char-display">
            <span className="home-bento-char">学</span>
            <div className="home-hanzi-grid-bg home-hanzi-grid-bg--card" aria-hidden="true" />
          </div>
          <div>
            <p className="home-bento-char-pinyin">xué</p>
            <p className="home-bento-char-meaning">To study, to learn</p>
            <p className="home-bento-char-meta">8 strokes · Radical: 子</p>
          </div>
        </div>

        {/* Subtitle Generator — 4-col */}
        <Link to="/subtitles" className="home-bento-card">
          <span className="home-label-chip">Powered by Whisper</span>
          <div className="home-bento-card-icon">💬</div>
          <h3 className="home-bento-card-title">Subtitle Generator</h3>
          <p className="home-bento-card-desc">Upload audio or video and get a ready-to-use .srt subtitle file.</p>
          <span className="home-bento-card-link">Generate Subtitles →</span>
        </Link>

        {/* Podcasts — 4-col */}
        <Link to="/podcasts" className="home-bento-card">
          <span className="home-label-chip">Synchronized</span>
          <div className="home-bento-card-icon">🎙</div>
          <h3 className="home-bento-card-title">Podcast Player</h3>
          <p className="home-bento-card-desc">Mandarin podcasts with dual Chinese/English subtitles and clickable words.</p>
          <span className="home-bento-card-link">Browse Podcasts →</span>
        </Link>

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
          <Route path="/podcasts" element={
            <ProtectedRoute>
              <Podcasts />
            </ProtectedRoute>
          } />
          <Route path="/podcasts/:podcastId/episodes/:episodeId" element={
            <ProtectedRoute>
              <PodcastEpisode />
            </ProtectedRoute>
          } />
          <Route path="/login" element={<Login />} />
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
