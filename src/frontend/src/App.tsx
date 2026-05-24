import { lazy, Suspense, useState } from 'react';
import Layout from './components/Layout';
import DashboardPanel from './components/DashboardPanel';
import StatsBar from './components/StatsBar';
import VulnTable from './components/VulnTable';

const SettingsPanel = lazy(() => import('./components/SettingsPanel'));
const AssetsPanel = lazy(() => import('./components/AssetsPanel'));
const FindingsPanel = lazy(() => import('./components/FindingsPanel'));

export default function App() {
  const [tab, setTab] = useState('dashboard');

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
      <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading…</div>}>
        {tab === 'dashboard' ? (
          <DashboardPanel />
        ) : tab === 'vulnerabilities' ? (
          <>
            <StatsBar />
            <VulnTable />
          </>
        ) : tab === 'assets' ? (
          <AssetsPanel />
        ) : tab === 'findings' ? (
          <FindingsPanel />
        ) : (
          <SettingsPanel />
        )}
      </Suspense>
    </Layout>
  );
}
