import React from 'react';

const ErrorStateView = ({ error, onRetry }) => (
  <div className="min-h-screen bg-black text-white flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 text-red-500 mx-auto mb-4">!</div>
      <h2 className="text-2xl font-bold mb-2 text-red-400">Connection Error</h2>
      <p className="text-gray-400 mb-4">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200"
      >
        Retry
      </button>
    </div>
  </div>
);

export default ErrorStateView;
