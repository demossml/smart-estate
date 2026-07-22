import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Plug, Wand2, ShieldCheck } from 'lucide-react';

const tabs = [
  { to: '/', icon: LayoutDashboard, label: 'Дом', sf: 'house.fill' },
  { to: '/devices', icon: Plug, label: 'Устройства', sf: 'switch.2' },
  { to: '/scenarios', icon: Wand2, label: 'Сценарии', sf: 'sparkles' },
  { to: '/events', icon: ShieldCheck, label: 'События', sf: 'bell.fill' },
];

/**
 * iOS-style TabBar — 50px height, SF-like spacing.
 * Backdrop blur glass effect.
 * Active tab: filled icon + SF weight.
 */
export function TabBar() {
  return (
    <nav
      className="app-tabbar flex justify-around items-end z-30 select-none"
      role="navigation"
      aria-label="Основная навигация"
    >
      {tabs.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center justify-end gap-0.5 pt-1 pb-0
             min-h-[44px] min-w-[48px] rounded-xl transition-all duration-150 tap-active
             ${isActive ? 'text-blue' : 'text-text-secondary'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                size={24}
                strokeWidth={isActive ? 2.5 : 1.8}
                className="transition-all duration-150"
              />
              <span
                className={`text-[9px] leading-none tracking-tight transition-all duration-150 ${
                  isActive ? 'font-semibold opacity-100' : 'font-normal opacity-70'
                }`}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
