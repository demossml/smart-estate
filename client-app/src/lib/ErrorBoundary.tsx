import { Component, type ReactNode } from 'react';
import { logInfo } from './logger';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // This will be captured by our logger (console.error is overridden)
    console.error(`[ErrorBoundary] ${error.message}`, error);
    logInfo('ErrorBoundary caught render error', `${error.message}\n${info.componentStack?.slice(0, 300)}`);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center h-full bg-[#0D1117] text-center px-6">
          <div className="text-5xl mb-4">💥</div>
          <h2 className="text-lg font-bold text-[#E6EDF3] mb-2">Что-то сломалось</h2>
          <p className="text-xs text-[#8B949E] mb-3 max-w-xs">{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="px-6 py-2.5 bg-[#00B4FF] text-[#0D1117] font-semibold rounded-xl text-sm active:scale-[0.97] transition-transform"
          >
            Перезагрузить
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
