import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Plug, Wand2, DoorOpen, ShieldCheck } from 'lucide-react';

const tabs = [
  { to: '/', icon: LayoutDashboard, label: 'Дом' },
  { to: '/devices', icon: Plug, label: 'Устр.' },
  { to: '/gates', icon: DoorOpen, label: 'Ворота' },
  { to: '/scenarios', icon: Wand2, label: 'Сценарии' },
  { to: '/events', icon: ShieldCheck, label: 'События' },
];

/**
 * Bottom tab bar — 56px height, large touch targets.
 * 4 tabs with icons + labels.
 */
export function TabBar() {
  return (
    <nav
      className="app-tabbar fixed bottom-0 bg-surface border-t border-surface-hover
                 flex justify-around items-center z-30"
      role="navigation"
      aria-label="Основная навигация"
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 px-1 py-1
             min-h-[48px] min-w-[52px] rounded-lg transition-colors tap-active
             ${isActive ? 'text-blue' : 'text-text-dim hover:text-text'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={22} fill={isActive ? 'currentColor' : 'none'} />
              <span className="text-[10px] leading-none">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
