import SettingsIcon from '@mui/icons-material/Settings';
import type { ConsoleLog, ViewMode } from '../types';

interface Props {
    consoleLogs: ConsoleLog[];
    showSearchInfo: boolean;
    onToggleSearchInfo: () => void;
    isExtracting: boolean;
    isCancelling: boolean;
    onCancelOperations: () => void;
    onOpenSettings: () => void;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
}

const CATEGORIES: Array<{ value: ViewMode; label: string }> = [
    { value: 'champion', label: 'Champions' },
    { value: 'tft', label: 'TFT' },
    { value: 'ward', label: 'Wards' },
    { value: 'emote', label: 'Emotes' },
];

/* Ported from FrogChanger TopControls.js. The champion/TFT/ward/emote segmented
   control switches the browsed data source; champions and TFT extract, wards and
   emotes are browse-only (matching the old Electron build). */
export function TopControls({
    consoleLogs,
    showSearchInfo,
    onToggleSearchInfo,
    isExtracting,
    isCancelling,
    onCancelOperations,
    onOpenSettings,
    viewMode,
    onViewModeChange,
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

            {/* Data source segmented control. */}
            <div
                className="flex items-center bg-gray-900 border border-gray-700 rounded-lg mr-2 flex-shrink-0"
                style={{ boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)', padding: 2 }}
                role="tablist"
                aria-label="Data source"
            >
                {CATEGORIES.map((cat) => {
                    const active = viewMode === cat.value;
                    return (
                        <button
                            key={cat.value}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => onViewModeChange(cat.value)}
                            className="px-2 py-1 text-xs font-medium rounded-md transition-colors focus:outline-none"
                            style={active
                                ? {
                                    color: '#fff',
                                    backgroundColor: 'var(--accent2)',
                                    boxShadow: '0 0 8px color-mix(in srgb, var(--accent2), transparent 40%)',
                                }
                                : { color: 'rgba(255,255,255,0.62)', backgroundColor: 'transparent' }}
                            title={`Show ${cat.label}`}
                        >
                            {cat.label}
                        </button>
                    );
                })}
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
