import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { logError } from '../../utils/logger';
import { WarningCircle, ArrowClockwise, House, CaretDown, CaretUp, Copy, Check, ShieldWarning } from '@phosphor-icons/react';

export type ErrorBoundaryLevel = 'root' | 'route' | 'component';

export interface FallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  resetError: () => void;
  level: ErrorBoundaryLevel;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((props: FallbackProps) => ReactNode);
  fallbackComponent?: ReactNode | ((props: FallbackProps) => ReactNode);
  level?: ErrorBoundaryLevel;
  title?: string;
  message?: string;
  showLobbyButton?: boolean;
  showReloadButton?: boolean;
  showDetails?: boolean;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetailsAccordion: boolean;
  copied: boolean;
}

const ComponentBase = Component as any as {
  new (props: ErrorBoundaryProps): {
    props: ErrorBoundaryProps;
    state: ErrorBoundaryState;
    setState(state: Partial<ErrorBoundaryState> | ((prevState: ErrorBoundaryState) => Partial<ErrorBoundaryState>), callback?: () => void): void;
  };
};

export class ErrorBoundary extends ComponentBase {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetailsAccordion: false,
    copied: false,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    const level = this.props.level || 'component';
    logError(`[ErrorBoundary:${level}] Uncaught React Error:`, error.message, {
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.props.onReset?.();
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetailsAccordion: false,
      copied: false,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  handleCopyDetails = (): void => {
    const { error, errorInfo } = this.state;
    const details = `Error: ${error?.name}: ${error?.message}\n\nStack:\n${error?.stack || 'N/A'}\n\nComponent Stack:\n${errorInfo?.componentStack || 'N/A'}`;
    navigator.clipboard.writeText(details).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  toggleDetails = (): void => {
    this.setState((prev) => ({ showDetailsAccordion: !prev.showDetailsAccordion }));
  };

  renderDefaultRootFallback(): ReactNode {
    const { title, message } = this.props;
    const { error, errorInfo, showDetailsAccordion, copied } = this.state;

    return (
      <div className="min-h-screen w-full bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4 sm:p-6 font-sans select-none selection:bg-velocity-red selection:text-white">
        {/* Background glow */}
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_40%,_rgba(255,77,77,0.08),_transparent_60%)]" />

        <div className="relative z-10 max-w-xl w-full bg-[#121212]/90 backdrop-blur-2xl border border-red-500/20 rounded-3xl p-6 sm:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_30px_rgba(255,77,77,0.15)] flex flex-col items-center text-center">
          {/* Top red accent line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent" />

          {/* Icon Badge */}
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-primary shadow-[0_0_20px_rgba(255,77,77,0.3)] mb-5">
            <ShieldWarning size={36} weight="duotone" className="text-primary animate-pulse" />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-white mb-2">
            {title || 'Application Encountered an Error'}
          </h1>
          <p className="text-sm text-text-secondary font-mono max-w-md mb-6 leading-relaxed">
            {message || 'An unexpected rendering error occurred. The application state has been preserved safely without data corruption.'}
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full mb-6">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 min-w-[140px] px-5 py-2.5 rounded-full bg-primary hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider font-mono transition-all shadow-[0_0_20px_rgba(255,77,77,0.35)] flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <ArrowClockwise size={16} weight="bold" />
              <span>Reload App</span>
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="flex-1 min-w-[140px] px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-xs uppercase tracking-wider font-mono transition-all flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <House size={16} weight="bold" />
              <span>Return to Lobby</span>
            </button>
          </div>

          {/* Collapsible Error Details */}
          <div className="w-full text-left border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={this.toggleDetails}
              className="w-full flex items-center justify-between text-xs text-text-muted hover:text-text-secondary font-mono cursor-pointer transition-colors py-1"
            >
              <span className="flex items-center gap-1.5">
                <WarningCircle size={14} className="text-primary" />
                <span>Technical Details</span>
              </span>
              {showDetailsAccordion ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </button>

            {showDetailsAccordion && (
              <div className="mt-3 bg-black/70 border border-white/10 rounded-xl p-3 relative font-mono text-[11px] leading-relaxed text-red-300 overflow-x-auto max-h-48 scrollbar-thin">
                <button
                  type="button"
                  onClick={this.handleCopyDetails}
                  className="absolute top-2 right-2 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <div className="font-bold text-white mb-1">
                  {error?.name || 'Error'}: {error?.message || 'Unknown error'}
                </div>
                {error?.stack && (
                  <pre className="text-[10px] text-text-muted whitespace-pre-wrap break-all mt-1">
                    {error.stack}
                  </pre>
                )}
                {errorInfo?.componentStack && (
                  <pre className="text-[10px] text-text-muted whitespace-pre-wrap break-all mt-2 border-t border-white/10 pt-2">
                    Component Stack:{errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  renderDefaultRouteFallback(): ReactNode {
    const { title, message, showLobbyButton = true } = this.props;
    const { error, errorInfo, showDetailsAccordion, copied } = this.state;

    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center p-6 sm:p-10 font-sans">
        <div className="max-w-lg w-full bg-[#141414] border border-red-500/25 rounded-2xl p-6 sm:p-8 shadow-[0_15px_40px_rgba(0,0,0,0.8)] text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-primary mb-4 shadow-[0_0_15px_rgba(255,77,77,0.25)]">
            <WarningCircle size={28} weight="duotone" />
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-white mb-2 font-display">
            {title || 'View Rendering Interrupted'}
          </h2>
          <p className="text-xs text-text-secondary font-mono mb-5 max-w-sm">
            {message || 'This section encountered an unexpected error. You can return to the lobby or retry loading this view.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 w-full mb-4">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 rounded-full bg-primary hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider font-mono transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowClockwise size={14} weight="bold" />
              <span>Retry View</span>
            </button>
            {showLobbyButton && (
              <button
                type="button"
                onClick={this.handleGoHome}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-xs uppercase tracking-wider font-mono transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <House size={14} weight="bold" />
                <span>Return to Lobby</span>
              </button>
            )}
          </div>

          {/* Error Details */}
          <div className="w-full text-left border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={this.toggleDetails}
              className="w-full flex items-center justify-between text-[11px] text-text-muted hover:text-text-secondary font-mono cursor-pointer"
            >
              <span>Error Details: {error?.message?.slice(0, 40)}...</span>
              {showDetailsAccordion ? <CaretUp size={12} /> : <CaretDown size={12} />}
            </button>
            {showDetailsAccordion && (
              <div className="mt-2 bg-black/80 border border-white/10 rounded-lg p-2.5 text-[10px] font-mono text-red-300 relative max-h-36 overflow-y-auto">
                <button
                  type="button"
                  onClick={this.handleCopyDetails}
                  className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[9px] text-white flex items-center gap-1"
                >
                  {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <div className="font-bold text-white">{error?.name}: {error?.message}</div>
                {error?.stack && <pre className="text-text-muted whitespace-pre-wrap mt-1">{error.stack}</pre>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  renderDefaultComponentFallback(): ReactNode {
    const { title, message } = this.props;
    const { error, showDetailsAccordion } = this.state;

    return (
      <div className="w-full p-4 rounded-xl bg-red-950/20 border border-red-500/20 text-text-primary flex flex-col gap-2 my-2 font-mono text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-primary font-bold">
            <WarningCircle size={16} />
            <span>{title || 'Component temporarily unavailable'}</span>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
        <p className="text-[11px] text-text-secondary">
          {message || (error?.message ? `Notice: ${error.message}` : 'A subcomponent error occurred.')}
        </p>
      </div>
    );
  }

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, fallbackComponent, level = 'component' } = this.props;

    if (!hasError) {
      return children;
    }

    const customFallback = fallbackComponent || fallback;
    if (typeof customFallback === 'function') {
      return customFallback({
        error: error || new Error('Unknown Error'),
        errorInfo,
        resetError: this.handleReset,
        level,
      });
    }

    if (customFallback) {
      return customFallback;
    }

    if (level === 'root') {
      return this.renderDefaultRootFallback();
    }
    if (level === 'route') {
      return this.renderDefaultRouteFallback();
    }
    return this.renderDefaultComponentFallback();
  }
}

export function RootErrorBoundary({ children, ...props }: Omit<ErrorBoundaryProps, 'level'>) {
  return (
    <ErrorBoundary level="root" {...props}>
      {children}
    </ErrorBoundary>
  );
}

export function RouteErrorBoundary({ children, ...props }: Omit<ErrorBoundaryProps, 'level'>) {
  return (
    <ErrorBoundary level="route" {...props}>
      {children}
    </ErrorBoundary>
  );
}

export function ComponentErrorBoundary({ children, ...props }: Omit<ErrorBoundaryProps, 'level'>) {
  return (
    <ErrorBoundary level="component" {...props}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
