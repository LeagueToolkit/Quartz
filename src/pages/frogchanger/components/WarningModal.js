import React from 'react';

const WarningModal = ({
  open,
  leaguePath,
  extractionPath,
  hashStatus,
  warningDontShowAgain,
  setWarningDontShowAgain,
  onCancel,
  onOpenSettings,
}) => {
  if (!open) {
    return null;
  }

  const hasMissingLeaguePath = !leaguePath || leaguePath.trim() === '';
  const hasMissingExtractionPath = !extractionPath || extractionPath.trim() === '';
  const hasMissingHashes = !!hashStatus && (!hashStatus.allPresent || hashStatus.missing.length > 0);

  const missingRequirements = [];
  if (hasMissingLeaguePath) {
    missingRequirements.push('League of Legends Champions folder path');
  }
  if (hasMissingExtractionPath) {
    missingRequirements.push('WAD extraction output path');
  }
  if (hasMissingHashes) {
    missingRequirements.push(`Hash files (missing ${hashStatus.missing.length} file(s))`);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300" onClick={onCancel} />
      <div className="relative bg-gradient-to-br from-red-900/90 via-red-800/90 to-orange-900/90 border-2 border-red-500 rounded-2xl p-6 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300 shadow-2xl">
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-orange-500/20 to-red-500/20 animate-pulse" />
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500 animate-shimmer" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center animate-bounce">
              <span className="text-2xl" style={{ color: '#ffffff' }}>!</span>
            </div>
            <h2 className="text-2xl font-bold" style={{ color: '#ffffff' }}>Setup Required</h2>
          </div>

          <div className="mb-4 space-y-2">
            <p className="text-white/90 text-sm">
              Before you can extract or repath skins, you need to configure:
            </p>
            <ul className="list-disc list-inside text-white/80 text-sm space-y-1 ml-2">
              {missingRequirements.map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              id="dontShowAgain"
              checked={warningDontShowAgain}
              onChange={(e) => setWarningDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-gray-400 text-red-500 focus:ring-red-500"
            />
            <label htmlFor="dontShowAgain" className="text-white/80 text-sm cursor-pointer">
              Don't show this warning again
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={onOpenSettings}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-200 font-semibold"
              style={{ color: '#ffffff' }}
            >
              <span style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}>Open Settings</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarningModal;
