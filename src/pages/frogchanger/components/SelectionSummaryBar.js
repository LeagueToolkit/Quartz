import React from 'react';

const SelectionSummaryBar = ({
  selectedSkins,
  isExtracting,
  isRepathing,
  isSetupValid,
  onExtract,
  onRepath,
  onClearAll,
}) => {
  if (selectedSkins.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-black/90 border border-gray-700 rounded-lg p-4 backdrop-blur-sm z-50">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div>
            <h4 className="text-sm font-medium text-green-400 mb-1">Selected Skins ({selectedSkins.length})</h4>
            <div className="text-white text-sm">
              {selectedSkins.map((skin, index) => (
                <span key={index}>
                  {typeof skin === 'string'
                    ? skin
                    : `${skin.name}${skin.champion?.name ? ` (${skin.champion.name})` : ''}`
                  }
                  {index < selectedSkins.length - 1 && ', '}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExtract}
            disabled={isExtracting || isRepathing || !isSetupValid || selectedSkins.length === 0}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
          >
            {isExtracting && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            )}
            {isExtracting ? 'Extracting...' : 'Extract WAD'}
          </button>
          <button
            onClick={onRepath}
            disabled={isExtracting || isRepathing || !isSetupValid || selectedSkins.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
          >
            {isRepathing && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            )}
            {isRepathing ? 'Repathing...' : 'Repath'}
          </button>
          <button
            onClick={onClearAll}
            disabled={isExtracting || isRepathing}
            className="px-4 py-2 border border-gray-600 text-gray-300 hover:bg-gray-800 rounded-lg transition-all duration-200 disabled:opacity-50"
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectionSummaryBar;
