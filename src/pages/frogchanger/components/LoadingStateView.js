import React from 'react';

const LoadingStateView = () => (
  <div className="min-h-screen bg-black text-white flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
      <p className="text-green-400">Loading Asset Extractor...</p>
    </div>
  </div>
);

export default LoadingStateView;
