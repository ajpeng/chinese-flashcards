import './App.css'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import Health from './pages/Health'
import Articles from './pages/Articles'
import SegmentArticle from './pages/SegmentArticle'
import SpeechPractice from './pages/SpeechPractice'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Settings from './pages/Settings'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import NavBar from './components/NavBar'

function Home() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <h2 style={{ fontSize: '36px', marginBottom: '16px' }}>
        Welcome to Chinese Flashcards
      </h2>
      <p style={{ fontSize: '18px', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '32px' }}>
        Learn Chinese through interactive articles with automatic word segmentation, pinyin, and HSK level classification.
      </p>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link
          to="/articles"
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          Browse Articles
        </Link>
        <Link
          to="/speech-practice"
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: 'rgba(139, 69, 19, 0.8)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          🎤 Speech Practice
        </Link>
        <Link
          to="/new"
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            textDecoration: 'none',
            color: 'inherit'
          }}
        >
          Create New Article
        </Link>
      </div>
    </div>
  )
}

function Layout() {
  const navigate = useNavigate()

  return (
    <div className="App">
      <NavBar />

      <main style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
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
          <Route path="/health" element={<Health />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
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
