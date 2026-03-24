import { useState } from 'react';
import Layout from './components/Layout';
import StatsBar from './components/StatsBar';
import VulnTable from './components/VulnTable';
import ScoringPanel from './components/ScoringPanel';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [tab, setTab] = useState('dashboard');

  return (
    <Layout activeTab={tab} onTabChange={setTab}>
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
    </Layout>
  );
}
