import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LargeModeProvider } from './hooks/LargeModeProvider';
import { useDeviceProfile } from './hooks/useDeviceProfile';
import { TabBar } from './components/ui/TabBar';
import { DebugPanel } from './lib/DebugPanel';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Scenarios from './pages/Scenarios';
import Analytics from './pages/Analytics';
import Welcome from './pages/Welcome';
import Gates from './pages/Gates';
import Events from './pages/Events';

/** Layout with bottom tab bar */
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen bg-bg text-text font-sans select-none">
      {children}
      <TabBar />
      <DebugPanel />
    </div>
  );
}

/**
 * Root app component.
 * PWA shell: dark theme, bottom tabs, voice FAB on all screens.
 * /start — welcome/setup page (no tabs)
 * / — main app with tabs
 */
export default function App() {
  useDeviceProfile();

  return (
    <LargeModeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/start" element={<Welcome />} />
          <Route path="/" element={<AppLayout><Dashboard /></AppLayout>} />
          <Route path="/devices" element={<AppLayout><Devices /></AppLayout>} />
          <Route path="/gates" element={<AppLayout><Gates /></AppLayout>} />
          <Route path="/scenarios" element={<AppLayout><Scenarios /></AppLayout>} />
          <Route path="/events" element={<AppLayout><Events /></AppLayout>} />
          <Route path="/analytics" element={<AppLayout><Analytics /></AppLayout>} />
        </Routes>
      </BrowserRouter>
    </LargeModeProvider>
  );
}
