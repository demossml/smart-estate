import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { logClient } from './logger';

interface Props {
  children: ReactNode;
}

interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logClient('error', error.message, info.componentStack || undefined);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-bg text-text flex items-center justify-center p-6">
        <div className="bg-surface rounded-card p-5 border border-red/30 w-full max-w-sm">
          <h1 className="text-lg font-bold text-red mb-2">Ошибка интерфейса</h1>
          <p className="text-sm text-text-dim mb-4">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full min-h-[48px] rounded-btn bg-blue text-white font-semibold flex items-center justify-center gap-2 tap-active"
          >
            <RotateCcw size={18} />
            Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}
