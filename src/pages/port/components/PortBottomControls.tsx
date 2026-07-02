import type { ReactNode } from 'react';
import { Tooltip } from '@mui/material';
import { Undo2 as UndoIcon } from 'lucide-react';

export interface PortActionButton {
    id: string;
    title: string;
    color: string;
    icon: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
}

interface PortBottomControlsProps {
    statusMessage: string;
    hasTarget: boolean;
    handleUndo: () => void;
    canUndo: boolean;
    handleSave: () => void;
    isProcessing: boolean;
    hasChangesToSave: () => boolean;
    /* VFX action buttons (formerly the floating island) — rendered at the left. */
    actions?: PortActionButton[];
}

/* Single compact bottom bar: VFX action buttons on the left, the status/console
   output truly centered, Undo/Save on the right. (Trim toggles moved into each
   column's search bar as a scissor toggle.) */
export default function PortBottomControls({
    statusMessage,
    hasTarget,
    handleUndo,
    canUndo,
    handleSave,
    isProcessing,
    hasChangesToSave,
    actions = [],
}: PortBottomControlsProps) {
    const canSave = !isProcessing && hasChangesToSave();
    const showActions = hasTarget && !isProcessing && actions.length > 0;

    return (
        <div className="port-bottom-bar">
            <div className="port-bottom-bar__actions port-bottom-bar__actions--left">
                {showActions &&
                    actions.map(({ id, title, color, icon, onClick, disabled }) => (
                        <Tooltip key={id} title={title} arrow placement="top" componentsProps={{ tooltip: { sx: { fontFamily: 'var(--font-mono)', fontSize: '0.72rem' } } }}>
                            <span>
                                <button
                                    className="port-action-btn"
                                    onClick={disabled ? undefined : onClick}
                                    disabled={disabled}
                                    style={{ '--action-color': color } as React.CSSProperties}
                                >
                                    {icon}
                                </button>
                            </span>
                        </Tooltip>
                    ))}
            </div>

            <span className="port-bottom-bar__status">{statusMessage}</span>

            <div className="port-bottom-bar__actions">
                <button
                    className="dl-btn dl-btn--secondary dl-btn--sm dl-btn--icon"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title={canUndo ? 'Undo last change' : 'Nothing to undo'}
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
