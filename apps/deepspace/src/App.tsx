import { useState } from 'react';
import {
  AuthOverlay,
  DeepSpaceAuthProvider,
  RecordProvider,
  RecordScope,
  signOut,
  useAuthProfileReady,
  useMutations,
  useQuery
} from 'deepspace';
import { syntheticNotification } from './fixture';
import { schemas, type SavingsNotification } from './schema';

declare const __DEEPSPACE_APP_ID__: string;
const scopeId = `app:${__DEEPSPACE_APP_ID__}`;

export function App() {
  return (
    <DeepSpaceAuthProvider>
      <RecordProvider allowAnonymous>
        <RecordScope roomId={scopeId} schemas={schemas}>
          <Dashboard />
        </RecordScope>
      </RecordProvider>
    </DeepSpaceAuthProvider>
  );
}

function Dashboard() {
  const { isLoaded, isSignedIn, user } = useAuthProfileReady({ requireUser: true });
  const [showAuth, setShowAuth] = useState(false);
  const live = useQuery<SavingsNotification>('savings-notifications', {
    orderBy: 'createdAt', orderDir: 'desc', limit: 20
  });
  const mutations = useMutations<SavingsNotification>('savings-notifications');
  const [writeError, setWriteError] = useState<string | null>(null);
  const records = live.records.length ? live.records.map(record => record.data) : [syntheticNotification];

  async function addFixture() {
    if (!user || !mutations.ready) return;
    setWriteError(null);
    try {
      await mutations.createConfirmed({
        ...syntheticNotification,
        userId: user.id,
        opportunityId: `synthetic-${Date.now()}`,
        createdAt: new Date().toISOString()
      });
    } catch {
      setWriteError('The notification was not saved. Check your role and reconnect.');
    }
  }

  return (
    <main>
      <header className="topbar">
        <div><span className="eyebrow">MoneyBack OS</span><strong>Recovery command center</strong></div>
        {isLoaded && isSignedIn
          ? <button className="secondary" onClick={() => void signOut()}>Sign out</button>
          : <button className="secondary" onClick={() => setShowAuth(true)}>Sign in</button>}
      </header>

      <section className="hero">
        <div>
          <span className="status">DeepSpace live foundation</span>
          <h1>Find money you should get back.</h1>
          <p>Retail offers, receipt evidence and recovery cases stay in the Railway and Tiger Data backend. This dashboard receives sanitized, user-scoped updates in real time.</p>
          <div className="actions">
            <button disabled={!isSignedIn || !mutations.ready} onClick={() => void addFixture()}>Create test notification</button>
            <span>{isSignedIn ? `Signed in as ${user?.name ?? user?.email}` : 'Sign in to test confirmed real-time writes.'}</span>
          </div>
          {writeError && <p className="error" role="alert">{writeError}</p>}
        </div>
        <div className="metric"><small>Potential recovery</small><b>$25.00</b><span>Fixture only—not confirmed savings</span></div>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Live activity</span><h2>Recovery notifications</h2></div><span className={`connection ${live.status}`}>{live.status}</span></div>
        <div className="notification-list">
          {records.map((notification, index) => (
            <article key={`${notification.opportunityId}-${index}`}>
              <span className="notification-icon">$</span>
              <div><strong>{notification.title}</strong><p>{notification.message}</p><small>{notification.synthetic ? 'Synthetic demo data' : 'Live sanitized event'} · {new Date(notification.createdAt).toLocaleString()}</small></div>
            </article>
          ))}
        </div>
      </section>
      <footer>Financial records remain in Tiger Data. Provider credentials never enter this client.</footer>
      {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
    </main>
  );
}
