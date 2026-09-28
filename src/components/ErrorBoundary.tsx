import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error inside ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] w-full flex items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-2xl dark:bg-[#111111] bg-white border border-black/10 dark:border-white/10 shadow-2xl text-center flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <AlertTriangle size={28} />
            </div>
            
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold dark:text-white text-slate-800">Something went wrong</h2>
              <p className="text-xs dark:text-zinc-400 text-slate-500">
                {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
              </p>
            </div>

            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-zinc-950 hover:opacity-90 transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <RefreshCw size={14} />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/';
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Home size={14} />
                <span>Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
