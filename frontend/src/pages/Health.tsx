import React, { useEffect, useState } from 'react'

type HealthResponse = {
  status?: string
  uptime?: number
  timestamp?: string
  [key: string]: unknown
}

export default function Health(): React.ReactElement {
  const [loading, setLoading] = useState<boolean>(true)
  const [data, setData] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${apiUrl}/health`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as HealthResponse
      setData(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchHealth()
  }, [])

  return (
    <div style={{ maxWidth: 800 }}>
      <h2>Health Check</h2>
      <p>This page queries <code>/health</code> on the backend and displays the result.</p>

      <div style={{ marginBottom: 12 }}>
        <button onClick={fetchHealth} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <div style={{ color: 'crimson' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <pre style={{ padding: 12, borderRadius: 6 }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}
