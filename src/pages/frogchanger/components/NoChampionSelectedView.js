import React from 'react';

const NoChampionSelectedView = ({ loading }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-2 text-white">
        Select a Champion
      </h2>
      <p className="text-gray-400">Choose a champion from the sidebar to view their skins</p>
      {loading && <p className="text-green-400 mt-2">Loading champions...</p>}
    </div>
  </div>
);

export default NoChampionSelectedView;
