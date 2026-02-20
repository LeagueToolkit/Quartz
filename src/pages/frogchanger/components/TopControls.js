import React from 'react';
import SettingsIcon from '@mui/icons-material/Settings';

const TopControls = ({
  consoleLogs,
  showSearchInfo,
  onToggleSearchInfo,
  isExtracting,
  isRepathing,
  isCancelling,
  onCancelOperations,
  onOpenSettings,
}) => {
  const latestMessage = consoleLogs.length > 0
    ? (consoleLogs[consoleLogs.length - 1]?.message || 'Ready...')
    : 'Ready...';

  return (
    <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
      <div className="min-w-0 mr-2">
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 h-8 overflow-x-auto overflow-y-hidden">
          <div className="text-xs text-gray-300 font-mono whitespace-nowrap">
            {consoleLogs.length > 0 ? (
              <div className="animate-pulse">{latestMessage}</div>
            ) : (
              latestMessage
            )}
          </div>
        </div>
      </div>

      <button
        className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition-all duration-200"
        onClick={onToggleSearchInfo}
        title="Search Help"
        aria-pressed={showSearchInfo}
      >
        i
      </button>

      {(isExtracting || isRepathing) && (
        <button
          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-all duration-200"
          onClick={onCancelOperations}
          disabled={isCancelling}
          title="Stop all operations"
        >
          {isCancelling ? '...' : 'Stop'}
        </button>
      )}

      <button
        className="p-2 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-all duration-200"
        onClick={onOpenSettings}
        title="Settings"
      >
        <SettingsIcon sx={{ fontSize: 18 }} />
      </button>
    </div>
  );
};

export default TopControls;
