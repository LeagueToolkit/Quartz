import React from 'react';

const ChampionSkinsPanel = ({
  selectedChampion,
  loadingSkins,
  championSkins,
  selectedSkins,
  extractingSkins,
  extractionProgress,
  chromaData,
  selectedChromas,
  getRarityIconUrl,
  getDefaultChromaColor,
  onSkinClick,
  onChromaClick,
  onDownloadSplashArt,
  offlineMode = false,
}) => (
  <div>
    <div className="mb-6">
      <h2 className="text-3xl font-bold mb-2 text-white">
        {selectedChampion.name}
      </h2>
    </div>

    {loadingSkins[selectedChampion.name] || championSkins.length === 0 ? (
      <div className="col-span-full flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
          <p className="text-green-400">
            {`Loading ${selectedChampion.name} skins...`}
          </p>
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {championSkins.map((skin) => {
          const isSelected = selectedSkins.some(s => (typeof s === 'string' ? s === skin.name : s.name === skin.name));

          return (
            <div
              key={`${selectedChampion?.name}-${skin.id}`}
              onClick={() => onSkinClick(skin.name)}
              className={`group relative rounded-lg overflow-visible border cursor-pointer transition-all duration-150 ${isSelected
                ? ''
                : 'border-gray-700 bg-gray-900 hover:border-white/25 hover:shadow-lg'
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
                  src={`https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${selectedChampion.alias}_${skin.id}.jpg`}
                  alt={skin.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  draggable={false}
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

              {extractingSkins[`${selectedChampion?.name}_${skin.id}`] && (
                <div className="absolute top-10 left-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-lg border border-white/10">
                  EXTRACTING...
                </div>
              )}

              {extractionProgress[`${selectedChampion?.name}_${skin.id}`] && !extractingSkins[`${selectedChampion?.name}_${skin.id}`] && (
                <div className="absolute bottom-2 left-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs font-bold backdrop-blur-md border border-white/20 shadow-lg text-center">
                  {extractionProgress[`${selectedChampion?.name}_${skin.id}`]}
                </div>
              )}

              {!offlineMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadSplashArt(selectedChampion.name, selectedChampion.alias, skin.id, skin.name);
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
              <p className="text-xs text-gray-400 mt-1">ID: {skin.id}</p>

              {(() => {
                const skinKey = `${selectedChampion?.name}_${skin.id}`;
                const chromas = chromaData[skinKey] || [];
                if (chromas.length === 0) {
                  return null;
                }

                return (
                  <div className="chroma-container">
                    {chromas.map((chroma, index) => {
                      const isSelected = selectedChromas[skinKey]?.id === chroma.id;
                      return (
                        <div key={chroma.id} className="relative">
                          <div
                            className={`chroma-dot ${isSelected ? 'selected' : ''}`}
                            style={{ backgroundColor: chroma.color || getDefaultChromaColor(index) }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onChromaClick(chroma, skin, selectedChampion?.name);
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
        })}
      </div>
    )}
  </div>
);

export default ChampionSkinsPanel;
