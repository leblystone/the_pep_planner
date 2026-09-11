import React from 'react';
import { themes } from '../../theme/themes';
import SupportModal from './SupportModal';
import AppErrorFallback from './AppErrorFallback';

/**
 * Error Boundary for Chunk Loading Failures
 * Catches errors from lazy-loaded components and provides recovery UI
 */
class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      showSupportModal: false
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('🚨 ChunkErrorBoundary caught an error:', error, errorInfo);
    
    // Check if this is a chunk loading error
    const isChunkError = 
      error?.message?.includes('Failed to fetch') ||
      error?.message?.includes('dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.name === 'ChunkLoadError';

    if (isChunkError) {
      console.error('📦 Chunk loading error detected');
    }

    this.setState({
      error,
      errorInfo
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleOpenSupport = () => {
    this.setState({ showSupportModal: true });
  };

  handleCloseSupport = () => {
    this.setState({ showSupportModal: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <>
          <AppErrorFallback onReload={this.handleReload} />
          <SupportModal
            open={this.state.showSupportModal}
            onClose={this.handleCloseSupport}
            theme={themes.sage}
          />
        </>
      );
    }

    return this.props.children;
  }
}

export default ChunkErrorBoundary;

