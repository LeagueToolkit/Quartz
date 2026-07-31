import type { ReactNode } from 'react';
import { Tooltip } from '@mui/material';
import { Undo2 as UndoIcon } from 'lucide-react';
import type { PortMode } from '@/lib/stores/portStore';

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
    /* VFX / ANM view switch. Page-global: both columns switch together, so it
       lives here rather than in a column header. Omit to hide the control. */
    mode?: PortMode;
    onModeChange?: (mode: PortMode) => void;
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
    mode,
    onModeChange,
}: PortBottomControlsProps) {
    const canSave = !isProcessing && hasChangesToSave();
    // Keep the action buttons MOUNTED whenever there's a target. Every port/
    // delete/save/undo runs through a task that briefly flips `isProcessing`
    // true→false; if that gated the group's *mount*, the whole button row would
    // unmount and remount on every action — the buttons "despawn"/flicker (e.g.
    // pressing Undo). So gate only their *enabled* state on `isProcessing`, not
    // their presence.
    const showActions = hasTarget && actions.length > 0;

    return (
        <div className="port-bottom-bar">
            <div className="port-bottom-bar__actions port-bottom-bar__actions--left">
                {mode && onModeChange && (
                    <div className="port-mode-switch" role="group" aria-label="Port view">
                        {(['vfx', 'anm'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                className={`port-mode-switch__opt${mode === m ? ' is-active' : ''}`}
                                aria-pressed={mode === m}
                                onClick={() => onModeChange(m)}
                                title={m === 'vfx' ? 'VFX systems and emitters' : 'Animation clips and events'}
                            >
                                {m === 'vfx' ? 'VFX' : 'ANM'}
                            </button>
                        ))}
                    </div>
                )}
                {showActions &&
                    actions.map(({ id, title, color, icon, onClick, disabled }) => {
                        const isDisabled = disabled || isProcessing;
                        return (
                        <Tooltip key={id} title={title} arrow placement="top" componentsProps={{ tooltip: { sx: { fontFamily: 'var(--font-mono)', fontSize: '0.72rem' } } }}>
                            <span>
                                <button
                                    className="port-action-btn"
                                    onClick={isDisabled ? undefined : onClick}
                                    disabled={isDisabled}
                                    style={{ '--action-color': color } as React.CSSProperties}
                                >
                                    {icon}
                                </button>
                            </span>
                        </Tooltip>
                        );
                    })}
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
