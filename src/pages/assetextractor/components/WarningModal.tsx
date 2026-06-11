/* Ported from FrogChanger WarningModal.js. Shown when League or output paths
   are not yet configured. */

interface Props {
    open: boolean;
    leaguePath: string;
    extractionPath: string;
    warningDontShowAgain: boolean;
    setWarningDontShowAgain: (v: boolean) => void;
    onCancel: () => void;
    onOpenSettings: () => void;
}

export function WarningModal({
    open,
    leaguePath,
    extractionPath,
    warningDontShowAgain,
    setWarningDontShowAgain,
    onCancel,
    onOpenSettings,
}: Props) {
    if (!open) return null;

    const hasMissingLeaguePath = !leaguePath || leaguePath.trim() === '';
    const hasMissingExtractionPath = !extractionPath || extractionPath.trim() === '';

    const missingRequirements: string[] = [];
    if (hasMissingLeaguePath) missingRequirements.push('League of Legends install folder path');
    if (hasMissingExtractionPath) missingRequirements.push('WAD extraction output path');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ zIndex: 200 }}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onCancel} />
            <div
                className="relative border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg"
                style={{
                    background: 'linear-gradient(135deg, rgba(127,29,29,0.92), rgba(124,45,18,0.92))',
                    border: '2px solid #ef4444',
                    borderRadius: 16,
                }}
            >
                <div className="absolute inset-0 rounded-lg overflow-hidden" style={{ pointerEvents: 'none', borderRadius: 16 }}>
                    <div className="absolute inset-0 animate-pulse" style={{ background: 'linear-gradient(90deg, rgba(239,68,68,0.2), rgba(249,115,22,0.2), rgba(239,68,68,0.2))' }} />
                    <div className="absolute top-2 left-2 h-1" style={{ left: 0, top: 0, width: '100%', background: 'linear-gradient(90deg, #ef4444, #f97316, #ef4444)', backgroundSize: '200% 100%', animation: 'shimmer 2s infinite' }} />
                </div>

                <div className="relative" style={{ zIndex: 10 }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center" style={{ background: '#ef4444' }}>
                            <span className="text-2xl" style={{ color: '#ffffff' }}>!</span>
                        </div>
                        <h2 className="text-2xl font-bold" style={{ color: '#ffffff' }}>Setup Required</h2>
                    </div>

                    <div className="mb-4 space-y-4">
                        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
                            Before you can extract skins, you need to configure:
                        </p>
                        <ul className="text-sm space-y-1 ml-2" style={{ color: 'rgba(255,255,255,0.8)', listStyle: 'disc', listStylePosition: 'inside' }}>
                            {missingRequirements.map((requirement) => (
                                <li key={requirement}>{requirement}</li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                        <input
                            type="checkbox"
                            id="ae-dontShowAgain"
                            checked={warningDontShowAgain}
                            onChange={(e) => setWarningDontShowAgain(e.target.checked)}
                            className="w-4 h-4"
                        />
                        <label htmlFor="ae-dontShowAgain" className="text-sm cursor-pointer" style={{ color: 'rgba(255,255,255,0.8)' }}>
                            Don't show this warning again
                        </label>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onCancel} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-all duration-200">
                            Cancel
                        </button>
                        <button
                            onClick={onOpenSettings}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 font-semibold"
                            style={{ background: '#dc2626', color: '#ffffff' }}
                        >
                            Open Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
