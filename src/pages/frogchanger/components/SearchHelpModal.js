import React from 'react';

const SearchHelpModal = ({ open, onClose }) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Search Help</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            x
          </button>
        </div>

        <div className="space-y-4 text-sm text-gray-300">
          <div>
            <h4 className="font-semibold text-green-400 mb-2">Search by Skinline:</h4>
            <ul className="space-y-1 ml-4">
              <li>- <span className="text-blue-400">Coven</span> - Find all Coven skins</li>
              <li>- <span className="text-blue-400">Star Guardian</span> - Find all Star Guardian skins</li>
              <li>- <span className="text-blue-400">K/DA</span> - Find all K/DA skins</li>
              <li>- <span className="text-blue-400">Spirit Blossom</span> - Find all Spirit Blossom skins</li>
              <li>- <span className="text-blue-400">Project:</span> - Find all Project skins</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-purple-400 mb-2">Search by Rarity:</h4>
            <ul className="space-y-1 ml-4">
              <li>- <span className="text-yellow-400">Epic</span> - Find all Epic tier skins</li>
              <li>- <span className="text-orange-400">Legendary</span> - Find all Legendary tier skins</li>
              <li>- <span className="text-red-400">Mythic</span> - Find all Mythic tier skins</li>
              <li>- <span className="text-pink-400">Ultimate</span> - Find all Ultimate tier skins</li>
              <li>- <span className="text-cyan-400">Base</span> - Find all base tier skins</li>
            </ul>
          </div>

          <div className="bg-gray-800 p-3 rounded border-l-4 border-green-400">
            <p className="text-xs text-gray-400">
              <strong>Tip:</strong> You can search for skinlines OR rarities in the same search bar.
              The search will find skins that match either the skinline name OR the rarity tier.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchHelpModal;
