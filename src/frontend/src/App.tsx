import { lazy, Suspense, useState } from 'react';
import Layout from './components/Layout';
import StatsBar from './components/StatsBar';
import VulnTable from './components/VulnTable';

const ScoringPanel = lazy(() => import('./components/ScoringPanel'));
const SettingsPanel = lazy(() => import('./components/SettingsPanel'));

export default function App() {
  const [tab, setTab] = useState('dashboard');

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading…</div>}>
        {tab === 'dashboard' ? (
          <>
            <StatsBar />
            <VulnTable />
          </>
        ) : tab === 'scoring' ? (
          <ScoringPanel />
        ) : (
          <SettingsPanel />
        )}
      </Suspense>
    </Layout>
  );
}
