import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, loginWithPatreon } = useAuth();

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
      </div>
    );
  }

  return <>{children}</>;
}
