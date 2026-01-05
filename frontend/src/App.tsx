import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Health from './pages/Health'
import Articles from './pages/Articles'
import useTheme from './theme'

function App() {
  const [count, setCount] = useState(0)
  const [page, setPage] = useState<'home' | 'health' | 'articles'>('home')

  const [theme, setTheme] = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  return (
    <div className="App">
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16 }}>
        <div>
          <a href="https://vite.dev" target="_blank">
            <img src={viteLogo} className="logo" alt="Vite logo" />
          </a>
          <a href="https://react.dev" target="_blank">
            <img src={reactLogo} className="logo react" alt="React logo" />
          </a>
        </div>
        <h1 style={{ margin: 0 }}>Vite + React</h1>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => setPage('home')}>
            Home
          </button>
          <button onClick={() => setPage('health')}>Health</button>
          <button onClick={() => setPage('articles')}>Articles</button>
          <button aria-label="Toggle theme" title={`Theme: ${theme}`} onClick={cycleTheme}>
            Theme: {theme}
          </button>
        </nav>
      </header>

      <main style={{ padding: 16 }}>
        {page === 'home' && (
          <>
            <div className="card">
              <button onClick={() => setCount((c) => c + 1)}>
                count is {count}
              </button>
              <p>
                Edit <code>src/App.tsx</code> and save to test HMR
              </p>
            </div>
            <p className="read-the-docs">Click on the Vite and React logos to learn more</p>
          </>
        )}

        {page === 'health' && <Health />}
        {page === 'articles' && <Articles />}
      </main>
    </div>
  )
}

export default App
