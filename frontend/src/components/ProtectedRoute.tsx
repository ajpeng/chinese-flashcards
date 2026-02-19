import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const isDev = import.meta.env.DEV;

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, loginWithPatreon, devLogin } = useAuth();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <p style={{ marginBottom: 16, fontSize: '18px' }}>You need to be logged in to access this page.</p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <button
            onClick={loginWithPatreon}
            style={{
              backgroundColor: 'rgba(255, 66, 0, 0.85)',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              color: '#fff',
              fontWeight: 600,
              fontSize: '16px',
            }}
          >
            Login with Patreon
          </button>
          {isDev && (
            <button
              onClick={devLogin}
              style={{
                backgroundColor: 'transparent',
                border: '1px dashed rgba(128,128,128,0.5)',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--muted-color)',
                fontSize: '13px',
              }}
            >
              Dev Login (local only)
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
