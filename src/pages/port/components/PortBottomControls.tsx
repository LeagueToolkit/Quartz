import { Undo2 as UndoIcon } from 'lucide-react';
import type { UndoEntry } from '../usePort';

interface PortBottomControlsProps {
    statusMessage: string;
    targetPyContent: string;
    trimTargetNames: boolean;
    setTrimTargetNames: (v: boolean) => void;
    trimDonorNames: boolean;
    setTrimDonorNames: (v: boolean) => void;
    handleUndo: () => void;
    undoHistory: UndoEntry[];
    handleSave: () => void;
    isProcessing: boolean;
    hasChangesToSave: () => boolean;
}

/* Single compact bottom bar (mirrors Paint): status/info on the left, the trim
   toggles in the middle, icon Undo + small Save on the right. */
export default function PortBottomControls({
    statusMessage,
    targetPyContent,
    trimTargetNames,
    setTrimTargetNames,
    trimDonorNames,
    setTrimDonorNames,
    handleUndo,
    undoHistory,
    handleSave,
    isProcessing,
    hasChangesToSave,
}: PortBottomControlsProps) {
    const canUndo = undoHistory.length > 0;
    const canSave = !isProcessing && hasChangesToSave();

    return (
        <div className="port-bottom-bar">
            <span className="port-bottom-bar__status">{statusMessage}</span>

            {targetPyContent && (
                <div className="port-bottom-bar__trims">
                    <label>
                        <input type="checkbox" checked={trimTargetNames} onChange={(e) => setTrimTargetNames(e.target.checked)} />
                        <span>Trim Target Names</span>
                    </label>
                    <label>
                        <input type="checkbox" checked={trimDonorNames} onChange={(e) => setTrimDonorNames(e.target.checked)} />
                        <span>Trim Donor Names</span>
                    </label>
                </div>
            )}

            <div className="port-bottom-bar__actions">
                <button
                    className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title={canUndo ? `Undo: ${undoHistory[undoHistory.length - 1]?.action} (${undoHistory.length})` : 'Nothing to undo'}
                >
                    <span className="dl-icon"><UndoIcon size={15} /></span>
                </button>
                <button
                    className="dl-btn dl-btn--sm port-save-btn"
                    onClick={handleSave}
                    disabled={!canSave}
                    title={hasChangesToSave() ? 'Save changes to file' : 'No changes to save'}
                >
                    Save
                </button>
            </div>
        </div>
    );
}
