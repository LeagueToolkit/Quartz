import React from 'react';

const SkinlineResultsPanel = ({
  skinlineSearchTerm,
  skinlineSearchResults,
  loading,
  selectedSkins,
  chromaData,
  selectedChromas,
  getRarityIconUrl,
  getDefaultChromaColor,
  onSkinClick,
  onChromaClick,
  onDownloadSplashArt,
  offlineMode = false,
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
          <p className="text-green-400">Searching Community Dragon skins data...</p>
          <p className="text-gray-400 text-sm mt-2">Loading all skins and filtering results</p>
        </div>
      </div>
    );
  }

  if (skinlineSearchResults.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-lg mb-2">No skins found</div>
        <p className="text-gray-500">Try searching for skinlines like "Coven", "Star Guardian", "K/DA", etc.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-2 text-white">
          Skinline Search: "{skinlineSearchTerm}"
        </h2>
        <p className="text-gray-400">
          Found {skinlineSearchResults.length} champions with matching skins
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {skinlineSearchResults.flatMap(({ champion, skins }) =>
          skins.map((skin) => {
            const isSelected = selectedSkins.some(s => s.name === skin.name && s.champion?.name === champion.name);
            return (
            <div
              key={`${champion.name}-${skin.id}`}
              onClick={() => onSkinClick(champion, skin)}
              className={`group relative rounded-lg overflow-visible border cursor-pointer transition-all duration-150 ${isSelected
                ? ''
                : 'border-gray-700 bg-gray-800 hover:border-white/25 hover:shadow-lg'
                }`}
              style={isSelected
                ? {
                  borderColor: 'color-mix(in srgb, var(--accent), transparent 42%)',
                  background: 'linear-gradient(160deg, color-mix(in srgb, var(--accent2), transparent 94%), color-mix(in srgb, var(--accent), transparent 95%))',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 0 20px color-mix(in srgb, var(--accent), transparent 72%), 0 12px 28px rgba(0,0,0,0.35)',
                  transform: 'scale(1.028)',
                  zIndex: 3,
                }
                : {
                  transform: 'scale(1)',
                  zIndex: 1,
                }}
            >
              <div className="aspect-[3/4] relative overflow-hidden">
                {!offlineMode ? (
                  <img
                    src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${skin.championAlias}_${skin.skinNumber}.jpg`}
                    alt={skin.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    draggable={false}
                    onError={(e) => {
                      e.target.src = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${skin.championAlias}_0.jpg`;
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 text-gray-300 text-xs flex items-center justify-center px-2 text-center">
                    Image unavailable offline
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="absolute top-2 left-2">
                  {!offlineMode ? (
                    <img
                      src={getRarityIconUrl(skin)}
                      alt={skin.rarity || 'No Rarity'}
                      className="w-6 h-6 rounded"
                      title={skin.rarity || 'No Rarity'}
                    />
                  ) : (
                    <div className="bg-gray-900/80 text-white px-2 py-1 rounded text-[10px] font-semibold" title={skin.rarity || 'No Rarity'}>
                      {skin.rarity || 'Base'}
                    </div>
                  )}
                </div>

                <div className="absolute top-2 left-10 bg-gray-900/80 text-white px-2 py-1 rounded text-xs font-bold">
                  {champion.name}
                </div>

                {isSelected && (
                  <div
                    className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold"
                    style={{
                      color: 'var(--accent)',
                      border: '1px solid color-mix(in srgb, var(--accent), transparent 48%)',
                      background: 'color-mix(in srgb, var(--accent), transparent 84%)',
                      boxShadow: '0 0 10px color-mix(in srgb, var(--accent), transparent 70%)',
                    }}
                  >
                    SELECTED
                  </div>
                )}

                {!offlineMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownloadSplashArt(champion.name, skin.championAlias, skin.skinNumber, skin.name);
                    }}
                    className="absolute bottom-2 right-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full transition-colors duration-200 opacity-0 group-hover:opacity-100"
                    title="Download Splash Art"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="p-3">
                <h3
                  className="font-medium transition-colors"
                  style={{ color: isSelected ? 'var(--accent)' : 'var(--text)' }}
                >
                  {skin.name}
                </h3>
                <p className="text-xs text-gray-400 mt-1">Skin ID: {skin.skinNumber}</p>

                {(() => {
                  const skinKey = `${champion.name}_${skin.skinNumber}`;
                  const chromas = chromaData[skinKey] || [];
                  if (chromas.length === 0) {
                    return null;
                  }

                  return (
                    <div className="chroma-container mt-2">
                      {chromas.map((chroma, index) => {
                        const isSelected = selectedChromas[skinKey]?.id === chroma.id;
                        return (
                          <div key={chroma.id} className="relative">
                            <div
                              className={`chroma-dot ${isSelected ? 'selected' : ''}`}
                              style={{ backgroundColor: chroma.color || getDefaultChromaColor(index) }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onChromaClick(chroma, skin, champion.name);
                              }}
                            >
                              <div className="chroma-tooltip">
                                <div className="chroma-preview-image">
                                  {!offlineMode ? (
                                    <img
                                      src={chroma.image_url}
                                      alt={chroma.name || `Chroma ${index + 1}`}
                                      className="w-32 h-32 object-cover rounded"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <div className="w-32 h-32 rounded bg-gray-800 text-gray-300 text-xs flex items-center justify-center text-center px-2">
                                      No image (offline)
                                    </div>
                                  )}
                                </div>
                                <div className="chroma-preview-name">
                                  {chroma.name || `Chroma ${index + 1}`}
                                </div>
                                <div className="chroma-preview-ids">
                                  <div className="text-xs text-gray-300">
                                    Skin ID: {chroma.id.toString().slice(-2)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
            );
          }),
        )}
      </div>
    </div>
  );
};

export default SkinlineResultsPanel;
