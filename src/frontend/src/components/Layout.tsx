import { type ReactNode } from 'react';
import { GitCompareArrows, LayoutDashboard, type LucideIcon, Server, Settings, ShieldAlert, Target } from 'lucide-react';

interface LayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Analysis',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Scoring profiles and prioritization stages' },
      { id: 'compare', label: 'Compare', icon: GitCompareArrows, description: 'Measure how scoring strategies reshape the remediation queue' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { id: 'vulnerabilities', label: 'Vulnerabilities', icon: ShieldAlert, description: 'Vulnerability intelligence from NVD, EPSS, KEV and EUVD' },
      { id: 'assets', label: 'Assets', icon: Server, description: 'Assets, software components and product resolution' },
      { id: 'findings', label: 'Findings', icon: Target, description: 'Vulnerabilities matched to asset software' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings, description: 'Ingestion schedules and source status' },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export default function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  const active = ALL_ITEMS.find((item) => item.id === activeTab) ?? ALL_ITEMS[0];

  return (
    <div className="min-h-screen bg-gray-100 md:flex">
      <aside className="border-b border-gray-950 bg-gray-900 text-gray-300 md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <div className="flex h-12 items-center gap-2.5 border-b border-gray-800 px-4">
          <BrandMark />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-wide text-white">Harmonia</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400">Prioritization lab</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-1 md:flex-col md:gap-4 md:overflow-y-auto md:py-4" aria-label="Main">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex shrink-0 gap-1 md:block">
              <div className="hidden px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 md:block">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const selected = item.id === active.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    aria-current={selected ? 'page' : undefined}
                    className={`relative flex shrink-0 items-center md:w-full gap-2.5 whitespace-nowrap rounded-sm px-2.5 py-1.5 text-[13px] transition-colors focus-visible:ring-offset-gray-900 ${
                      selected ? 'bg-gray-800 font-medium text-white' : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-100'
                    }`}
                  >
                    {selected && <span className="absolute inset-y-1 left-0 w-0.5 bg-accent-300" aria-hidden="true" />}
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="hidden border-t border-gray-800 px-4 py-3 text-[11px] leading-4 text-gray-500 md:block">
          Research prototype
          <br />
          Not for production use
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-gray-300 bg-white">
          <div className="mx-auto flex max-w-[108rem] flex-col gap-0.5 px-4 py-3 sm:px-6 lg:px-8">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
              {NAV_GROUPS.find((group) => group.items.includes(active))?.label}
            </div>
            <h1 className="text-lg font-semibold text-gray-900">{active.label}</h1>
            <p className="text-[13px] text-gray-500">{active.description}</p>
          </div>
        </header>
        <main className="mx-auto max-w-[108rem] px-4 py-5 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function BrandMark() {
  // Four stacked bars echo the four-level priority scale.
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="2" y="3" width="16" height="2.5" fill="#b23c33" />
      <rect x="2" y="7.2" width="12" height="2.5" fill="#c26424" />
      <rect x="2" y="11.4" width="8" height="2.5" fill="#d5b038" />
      <rect x="2" y="15.6" width="4" height="2.5" fill="#3f8158" />
    </svg>
  );
}
