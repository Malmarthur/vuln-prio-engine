import { lazy, Suspense, useEffect, useState } from 'react';
import FindingsFreshnessBanner from './components/FindingsFreshnessBanner';
import Layout from './components/Layout';
import Toasts from './components/Toasts';
import { ActivityProvider } from './lib/activity';
import DashboardPanel from './components/DashboardPanel';
import StatsBar from './components/StatsBar';
import VulnTable from './components/VulnTable';

const SettingsPanel = lazy(() => import('./components/SettingsPanel'));
const AssetsPanel = lazy(() => import('./components/AssetsPanel'));
const FindingsPanel = lazy(() => import('./components/FindingsPanel'));
const ComparisonWorkspace = lazy(() => import('./components/comparison/ComparisonWorkspace'));

// Tabs whose content depends on findings being matched and scored.
const FRESHNESS_TABS = new Set(['dashboard', 'vulnerabilities', 'assets', 'findings']);
const VALID_TABS = new Set(['dashboard', 'compare', 'vulnerabilities', 'assets', 'findings', 'settings']);

function tabFromUrl() {
  const value = new URL(window.location.href).searchParams.get('tab');
  return value && VALID_TABS.has(value) ? value : 'dashboard';
}

export default function App() {
  const [tab, setTab] = useState(tabFromUrl);

  useEffect(() => {
    const onPopState = () => setTab(tabFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextTab: string) => {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', nextTab);
    if (nextTab !== 'compare') url.searchParams.delete('job');
    window.history.pushState({}, '', url);
  };

  return (
    <ActivityProvider>
      <Layout activeTab={tab} onTabChange={navigate}>
        {FRESHNESS_TABS.has(tab) && (
          <FindingsFreshnessBanner onOpenFindings={tab === 'findings' ? undefined : () => navigate('findings')} />
        )}
        <Suspense fallback={<div className="p-8 text-center text-[13px] text-gray-500">Loading…</div>}>
          {tab === 'dashboard' ? (
            <DashboardPanel />
          ) : tab === 'compare' ? (
            <ComparisonWorkspace onManageProfiles={() => navigate('dashboard')} />
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
      <Toasts />
    </ActivityProvider>
  );
}
