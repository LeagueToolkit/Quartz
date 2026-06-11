/* Loading / error / empty state views — ported from FrogChanger's
   LoadingStateView, ErrorStateView and NoChampionSelectedView. */

export function LoadingStateView() {
    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4" />
                <p className="text-green-400">Loading Asset Extractor...</p>
            </div>
        </div>
    );
}

export function ErrorStateView({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
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
}

export function NoChampionSelectedView({ loading }: { loading: boolean }) {
    return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center">
                <h2 className="text-2xl font-bold mb-2 text-white">Select a Champion</h2>
                <p className="text-gray-400">Choose a champion from the sidebar to view their skins</p>
                {loading && <p className="text-green-400 mt-2">Loading champions...</p>}
            </div>
        </div>
    );
}
