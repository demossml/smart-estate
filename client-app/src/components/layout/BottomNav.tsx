import { NavLink } from 'react-router-dom';
import { Home, LayoutGrid, Search, Zap, Settings } from 'lucide-react';

const tabs = [
  { to: '/', icon: Home, label: 'Дом' },
  { to: '/rooms', icon: LayoutGrid, label: 'Комнаты' },
  { to: '/discovery', icon: Search, label: 'Поиск' },
  { to: '/scenarios', icon: Zap, label: 'Сценарии' },
  { to: '/settings', icon: Settings, label: 'Ещё' },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/80 backdrop-blur-md safe-bottom">
      <div className="flex items-center justify-around max-w-md mx-auto h-16">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `
              flex flex-col items-center justify-center w-14 py-1 text-xs transition-colors
              ${isActive ? 'text-primary' : 'text-muted-foreground'}
            `}
          >
            <tab.icon size={20} strokeWidth={2} />
            <span className="mt-1">{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
