import { Button } from '@mui/material';
import type { UndoEntry } from '../usePort';

interface PortBottomControlsProps {
    handleUndo: () => void;
    undoHistory: UndoEntry[];
    handleSave: () => void;
    isProcessing: boolean;
    hasChangesToSave: () => boolean;
}

export default function PortBottomControls({ handleUndo, undoHistory, handleSave, isProcessing, hasChangesToSave }: PortBottomControlsProps) {
    return (
        <div className="port-bottom-controls" style={{ display: 'flex', gap: '12px', padding: '12px 12px', background: 'transparent' }}>
            <Button
                onClick={handleUndo}
                disabled={undoHistory.length === 0}
                sx={{
                    flex: 1,
                    padding: '0 16px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    fontWeight: 700,
                    height: '36px',
                    background: 'color-mix(in oklab, var(--text-secondary) 12%, transparent)',
                    border: '1px solid color-mix(in oklab, var(--text-secondary) 30%, transparent)',
                    color: 'var(--text-secondary)',
                    borderRadius: '4px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    '&:hover': {
                        background: 'color-mix(in oklab, var(--text-secondary) 20%, transparent)',
                        borderColor: 'var(--text-secondary)',
                    },
                    '&:disabled': { opacity: 0.5, cursor: 'not-allowed', borderColor: 'color-mix(in oklab, var(--text-muted) 32%, transparent)', color: 'var(--text-muted)' },
                }}
                title={undoHistory.length > 0 ? `Undo: ${undoHistory[undoHistory.length - 1]?.action}` : 'Nothing to undo'}
            >
                Undo ({undoHistory.length})
            </Button>
            <Button
                onClick={handleSave}
                disabled={isProcessing || !hasChangesToSave()}
                sx={{
                    flex: 1,
                    padding: '0 16px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    fontWeight: 700,
                    height: '36px',
                    background: 'color-mix(in oklab, var(--color-success) 14%, transparent)',
                    border: '1px solid color-mix(in oklab, var(--color-success) 30%, transparent)',
                    color: 'var(--color-success)',
                    borderRadius: '4px',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    '&:hover': {
                        background: 'color-mix(in oklab, var(--color-success) 22%, transparent)',
                        borderColor: 'var(--color-success)',
                    },
                    '&:disabled': { opacity: 0.5, cursor: 'not-allowed', borderColor: 'color-mix(in oklab, var(--color-success) 30%, transparent)', color: 'color-mix(in oklab, var(--color-success) 40%, transparent)' },
                }}
                title={hasChangesToSave() ? 'Save changes to file' : 'No changes to save'}
            >
                Save
            </Button>
        </div>
    );
}
