import { Square as StopIcon } from 'lucide-react';

interface Props {
    isExtracting: boolean;
    isCancelling: boolean;
    onCancelOperations: () => void;
}

/* Top-right utility row. The category selector + search help moved into the
   sidebar; only the Stop control (shown during an operation) lives here now. */
export function TopControls({ isExtracting, isCancelling, onCancelOperations }: Props) {
    if (!isExtracting) return null;

    return (
        <div
            style={{
                position: 'sticky', top: 0, zIndex: 100,
                display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end',
                background: 'transparent', padding: '4px 0',
            }}
        >
            <button
                className="dl-btn dl-btn--icon dl-btn--danger"
                onClick={onCancelOperations}
                disabled={isCancelling}
                title="Stop all operations"
            >
                <span className="dl-icon"><StopIcon size={15} /></span>
            </button>
        </div>
    );
}
