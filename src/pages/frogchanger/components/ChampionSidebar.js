import React from 'react';

const ChampionSidebar = ({
  searchTerm,
  onSearchTermChange,
  skinlineSearchTerm,
  onSkinlineSearchTermChange,
  onSearchSkinlines,
  showSkinlineSearch,
  onClearSkinlineSearch,
  filteredChampions,
  selectedChampion,
  onSelectChampion,
  getChampionIconUrl,
}) => (
  <aside className="w-64 border-r border-gray-800 p-4 overflow-y-auto">
    <div className="relative mb-4">
      <input
        placeholder="Search champions..."
        value={searchTerm}
        onChange={(e) => onSearchTermChange(e.target.value)}
        className="w-full pl-4 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-green-400 focus:ring-1 focus:ring-green-400 focus:outline-none"
      />
    </div>

    <div className="mb-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            placeholder="Search skinlines..."
            value={skinlineSearchTerm}
            onChange={(e) => onSkinlineSearchTermChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && onSearchSkinlines()}
            className="w-full pl-4 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:border-green-400 focus:ring-1 focus:ring-green-400 focus:outline-none"
          />
        </div>
        <button
          onClick={onSearchSkinlines}
          className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200"
          title="Search for skinlines"
        >
          Search
        </button>
      </div>
      {showSkinlineSearch && (
        <button
          onClick={onClearSkinlineSearch}
          className="mt-2 text-xs text-gray-400 hover:text-white transition-colors"
        >
          Clear skinline search
        </button>
      )}
    </div>

    <div className="space-y-1">
      {filteredChampions.map((champion) => (
        <button
          key={champion.id}
          onClick={() => onSelectChampion(champion)}
          className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-all duration-200 hover:bg-gray-800 hover:border-l-4 hover:border-green-400 group ${selectedChampion?.id === champion.id ? 'bg-gray-800 border-l-4 border-green-400' : ''
            }`}
        >
          <img
            src={getChampionIconUrl(champion.id)}
            alt={champion.name}
            className="w-8 h-8 rounded-full group-hover:ring-2 group-hover:ring-green-400 transition-all duration-200"
          />
          <div>
            <div className="text-sm font-medium text-white group-hover:text-green-400 transition-colors">
              {champion.name}
            </div>
            <div className="text-xs text-gray-400">{champion.alias}</div>
          </div>
        </button>
      ))}
    </div>
  </aside>
);

export default ChampionSidebar;
