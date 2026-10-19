import React from 'react';
import { tr } from '../i18n';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Suppress WebGL context errors
    if (error?.message?.includes('maxTextureDimension2D') || 
        error?.message?.includes('Cannot read properties of undefined')) {
      // Silently ignore WebGL initialization errors
      this.setState({ hasError: false });
      return;
    }
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center w-full h-full bg-surface">
          <div className="text-center">
            <p className="text-slate-600">{tr("Something went wrong with the map.")}</p>
            <button 
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 px-4 py-2 bg-primary text-white text-sm font-bold uppercase tracking-wide hover:opacity-80"
            >
              {tr("Try Again")}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
