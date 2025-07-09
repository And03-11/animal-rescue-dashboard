// src/components/ErrorBoundary.tsx
import React from 'react';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('ErrorBoundary caught an error:', error);
  }

  render() {
    if (this.state.hasError) return <h1>Algo salió mal.</h1>;
    return this.props.children;
  }
}
