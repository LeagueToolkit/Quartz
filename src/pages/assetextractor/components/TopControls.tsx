import SettingsIcon from '@mui/icons-material/Settings';
import type { ConsoleLog } from '../types';

interface Props {
    consoleLogs: ConsoleLog[];
    showSearchInfo: boolean;
    onToggleSearchInfo: () => void;
    isExtracting: boolean;
    isCancelling: boolean;
    onCancelOperations: () => void;
    onOpenSettings: () => void;
}

/* Ported from FrogChanger TopControls.js. The Electron build had a
   champion/TFT/ward/emote segmented control; the Rust backend only exposes
   champion extraction, so only the Champions source is shown.
   TODO(backend): TFT / Ward / Emote data sources. */
export function TopControls({
    consoleLogs,
    showSearchInfo,
    onToggleSearchInfo,
    isExtracting,
    isCancelling,
    onCancelOperations,
    onOpenSettings,
}: Props) {
    const latestMessage =
        consoleLogs.length > 0 ? consoleLogs[consoleLogs.length - 1]?.message || 'Ready...' : 'Ready...';

    return (
        <div
            className="flex items-center gap-2 justify-end"
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: 'transparent',
                paddingTop: 4,
                paddingBottom: 4,
            }}
        >
            {/* Status console — auto-sizes to content (capped). */}
            <div className="mr-2 flex-shrink-0" style={{ maxWidth: 340 }}>
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 h-8 overflow-x-auto overflow-y-hidden">
                    <div className="text-xs text-gray-300 font-mono whitespace-nowrap">
                        {consoleLogs.length > 0 ? <div className="animate-pulse">{latestMessage}</div> : latestMessage}
                    </div>
                </div>
            </div>

            {/* Data source segmented control (Champions only). */}
            <div
                className="flex items-center bg-gray-900 border border-gray-700 rounded-lg mr-2 flex-shrink-0"
                style={{ boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)', padding: 2 }}
                role="tablist"
                aria-label="Data source"
            >
                <button
                    type="button"
                    role="tab"
                    aria-selected
                    className="px-2 py-1 text-xs font-medium rounded-md transition-colors focus:outline-none"
                    style={{
                        color: '#fff',
                        backgroundColor: 'var(--accent2)',
                        boxShadow: '0 0 8px color-mix(in srgb, var(--accent2), transparent 40%)',
                    }}
                    title="Show Champions"
                >
                    Champions
                </button>
            </div>

            <button
                className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 rounded-lg transition-all duration-200"
                onClick={onToggleSearchInfo}
                title="Search Help"
                aria-pressed={showSearchInfo}
            >
                i
            </button>

            {isExtracting && (
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
                className="p-2 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded-lg transition-all duration-200"
                onClick={onOpenSettings}
                title="Settings"
            >
                <SettingsIcon sx={{ fontSize: 18 }} />
            </button>
        </div>
    );
}
