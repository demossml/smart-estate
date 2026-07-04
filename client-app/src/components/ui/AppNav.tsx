import { Home, Workflow, Zap } from 'lucide-react';

const tabs = [
  { key: 'home', icon: Home, label: 'Дом' },
  { key: 'scenarios', icon: Workflow, label: 'Сценарии' },
  { key: 'energy', icon: Zap, label: 'Энергия' },
];

export function AppNav({ activeTab, onTabChange }: { activeTab: string; onTabChange: (key: string) => void }) {
  return (
    <nav className="app-nav flex justify-around items-end z-30 select-none" role="navigation" aria-label="Основная навигация">
      {tabs.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          className={'app-nav-btn' + (activeTab === key ? ' app-nav-btn--active' : '')}
          onClick={() => onTabChange(key)}
          aria-label={label}
        >
          <Icon size={18} strokeWidth={activeTab === key ? 2.5 : 1.6} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
