import { type ReactNode } from 'react';

interface LayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'compare', label: 'Compare' },
  { id: 'vulnerabilities', label: 'Vulnerabilities' },
  { id: 'assets', label: 'Assets' },
  { id: 'findings', label: 'Findings' },
  { id: 'settings', label: 'Settings' },
];

export default function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-[108rem] px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="shrink-0 text-xl font-bold text-gray-900 tracking-tight">
              Harmonia
            </h1>
            <nav className="ml-3 flex min-w-0 max-w-[68vw] space-x-1 overflow-x-auto sm:max-w-none">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTabChange(t.id)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === t.id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[108rem] px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
