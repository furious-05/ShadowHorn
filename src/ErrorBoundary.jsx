import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
    // You could also log to an external service here
    // console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-xl w-full p-8 bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold mb-3">An error occurred</h2>
            <p className="text-sm text-gray-600 mb-4">The application encountered an unexpected error while rendering. Details are shown below for debugging.</p>
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-40">{String(this.state.error && this.state.error.toString())}</pre>
            <div className="mt-4 flex gap-2">
              <button onClick={() => window.location.reload()} className="px-3 py-2 bg-blue-600 text-white rounded">Reload</button>
              <button onClick={() => this.setState({ hasError: false, error: null, info: null })} className="px-3 py-2 bg-gray-200 rounded">Dismiss</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
