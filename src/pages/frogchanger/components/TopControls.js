import React, { useState } from 'react';
import SettingsIcon from '@mui/icons-material/Settings';
import { BookOpen } from 'lucide-react';
import AssetPathCheatSheet from '../../../components/modals/AssetPathCheatSheet.js';

const TopControls = ({
  consoleLogs,
  showSearchInfo,
  onToggleSearchInfo,
  isExtracting,
  isRepathing,
  isCancelling,
  onCancelOperations,
  onOpenSettings,
  viewMode = 'champion',
  setViewMode = () => {},
  // legacy props kept for any external callers that still pass them
  tftMode = false,
  setTftMode = () => {},
}) => {
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  // Prefer the new viewMode prop; fall back to the legacy boolean for
  // backward compat. tftMode/setTftMode left declared but unused below.
  void tftMode; void setTftMode;
  const latestMessage = consoleLogs.length > 0
    ? (consoleLogs[consoleLogs.length - 1]?.message || 'Ready...')
    : 'Ready...';

  return (
    <div
      className="flex items-center gap-2 z-10 justify-end"
      style={{
        // Sticky to the top of the scrollable <main> so the mode picker stays
        // visible while the user scrolls the skin/ward/emote grid.
        position: 'sticky',
        top: 0,
        // Transparent — each child pill already has its own glassy background.
        background: 'transparent',
        paddingTop: 4,
        paddingBottom: 4,
      }}
    >

      {/* View Mode segmented control — champions / TFT / wards / emotes. */}
      <div
        className="flex items-center bg-gray-900 border border-gray-700 rounded-lg p-0.5 mr-2"
        style={{ boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)' }}
        role="tablist"
        aria-label="Data source"
      >
        {[
          { key: 'champion', label: 'Champions' },
          { key: 'tft', label: 'TFT' },
          { key: 'ward', label: 'Wards' },
          { key: 'emote', label: 'Emotes' },
        ].map(({ key, label }) => {
          const active = viewMode === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setViewMode(key)}
              className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors focus:outline-none"
              style={{
                color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                backgroundColor: active ? 'var(--accent2)' : 'transparent',
                boxShadow: active
                  ? '0 0 8px color-mix(in srgb, var(--accent2), transparent 40%)'
                  : 'none',
              }}
              title={`Show ${label}`}
            >
              {label}
            </button>
          );
        })}
      </div>

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
        className="p-2 text-gray-400 hover:text-purple-400 hover:bg-gray-800 rounded-lg transition-all duration-200"
        onClick={() => setCheatSheetOpen(true)}
        title="Asset Path Cheat Sheet (by Aropatnik)"
      >
        <BookOpen size={18} />
      </button>

      <button
        className="p-2 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-all duration-200"
        onClick={onOpenSettings}
        title="Settings"
      >
        <SettingsIcon sx={{ fontSize: 18 }} />
      </button>

      <AssetPathCheatSheet
        open={cheatSheetOpen}
        onClose={() => setCheatSheetOpen(false)}
      />
    </div>
  );
};

export default TopControls;
