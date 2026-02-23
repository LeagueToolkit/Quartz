/**
 * Flint - Checkpoint Timeline Component
 *
 * Shows project history with auto-diff on select, file change preview,
 * and progress tracking during checkpoint creation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../lib/state';
import * as api from '../lib/api';
import { getIcon } from '../lib/fileIcons';
import { listen } from '@tauri-apps/api/event';
import type { Checkpoint, CheckpointDiff, CheckpointProgress, CheckpointFileContent } from '../lib/types';

/** Helper to extract just the filename from a path */
function getFileName(path: string): string {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
}

/** Format file size in human-readable form */
function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CheckpointTimeline: React.FC = () => {
    const { state, showToast, setWorking, setReady } = useAppState();
    const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);
    const [diff, setDiff] = useState<CheckpointDiff | null>(null);
    const [isComparing, setIsComparing] = useState(false);

    // Creation progress
    const [isCreating, setIsCreating] = useState(false);
    const [createProgress, setCreateProgress] = useState<CheckpointProgress | null>(null);

    // File preview comparison
    const [previewFile, setPreviewFile] = useState<{ path: string; oldHash?: string; newHash?: string } | null>(null);
    const [previewOld, setPreviewOld] = useState<CheckpointFileContent | null>(null);
    const [previewNew, setPreviewNew] = useState<CheckpointFileContent | null>(null);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    // Cache diffs per checkpoint ID so we can show summary on cards
    const [diffCache, setDiffCache] = useState<Record<string, CheckpointDiff>>({});

    const activeTab = state.activeTabId
        ? state.openTabs.find(t => t.id === state.activeTabId)
        : null;
    const currentProjectPath = activeTab?.projectPath || null;

    // Listen for checkpoint progress events
    useEffect(() => {
        let unlisten: (() => void) | null = null;
        listen<CheckpointProgress>('checkpoint-progress', (event) => {
            setCreateProgress(event.payload);
        }).then(fn => { unlisten = fn; });

        return () => { if (unlisten) unlisten(); };
    }, []);

    const loadCheckpoints = useCallback(async () => {
        if (!currentProjectPath) return;
        setIsLoading(true);
        try {
            const list = await api.listCheckpoints(currentProjectPath);
            setCheckpoints(list);

            // Compute diffs for all checkpoints (for card summaries)
            const diffs: Record<string, CheckpointDiff> = {};
            for (let i = 0; i < list.length - 1; i++) {
                try {
                    const d = await api.compareCheckpoints(currentProjectPath, list[i + 1].id, list[i].id);
                    diffs[list[i].id] = d;
                } catch {
                    // Skip failed comparisons
                }
            }
            setDiffCache(diffs);
        } catch (err) {
            console.error('Failed to load checkpoints:', err);
            showToast('error', 'Failed to load checkpoints');
        } finally {
            setIsLoading(false);
        }
    }, [currentProjectPath, showToast]);

    useEffect(() => {
        loadCheckpoints();
    }, [loadCheckpoints]);

    // Auto-diff when a checkpoint is selected
    useEffect(() => {
        if (!selectedCheckpoint || !currentProjectPath) {
            setDiff(null);
            setPreviewFile(null);
            return;
        }

        const idx = checkpoints.findIndex(c => c.id === selectedCheckpoint);
        if (idx === -1) return;

        // If it's the oldest checkpoint, show as "initial" (all files are added)
        if (idx === checkpoints.length - 1) {
            const cp = checkpoints[idx];
            const initialDiff: CheckpointDiff = {
                added: Object.values(cp.file_manifest),
                modified: [],
                deleted: [],
            };
            setDiff(initialDiff);
            return;
        }

        // Use cached diff if available
        if (diffCache[selectedCheckpoint]) {
            setDiff(diffCache[selectedCheckpoint]);
            return;
        }

        // Compute diff from previous checkpoint
        const prevId = checkpoints[idx + 1].id;
        setIsComparing(true);
        api.compareCheckpoints(currentProjectPath, prevId, selectedCheckpoint)
            .then(d => {
                setDiff(d);
                setDiffCache(prev => ({ ...prev, [selectedCheckpoint]: d }));
            })
            .catch(err => {
                console.error('Failed to compare:', err);
                showToast('error', 'Failed to compute diff');
            })
            .finally(() => setIsComparing(false));
    }, [selectedCheckpoint, checkpoints, currentProjectPath, diffCache, showToast]);

    const handleCreateCheckpoint = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentProjectPath || !message.trim()) return;

        setIsCreating(true);
        setCreateProgress(null);
        try {
            await api.createCheckpoint(currentProjectPath, message);
            setMessage('');
            showToast('success', 'Checkpoint created');
            await loadCheckpoints();
        } catch (err) {
            console.error('Failed to create checkpoint:', err);
            showToast('error', 'Failed to create checkpoint');
        } finally {
            setIsCreating(false);
            setCreateProgress(null);
        }
    };

    const handleRestore = async (id: string) => {
        if (!currentProjectPath) return;
        if (!window.confirm('Restore this checkpoint? An auto-backup of the current state will be created first.')) return;

        setWorking('Restoring checkpoint...');
        try {
            await api.restoreCheckpoint(currentProjectPath, id);
            showToast('success', 'Project restored successfully');
            await loadCheckpoints();
        } catch (err) {
            console.error('Failed to restore checkpoint:', err);
            showToast('error', 'Failed to restore checkpoint');
        } finally {
            setReady();
        }
    };

    const handleDelete = async (id: string) => {
        if (!currentProjectPath) return;
        if (!window.confirm('Delete this checkpoint? This cannot be undone.')) return;

        try {
            await api.deleteCheckpoint(currentProjectPath, id);
            showToast('success', 'Checkpoint deleted');
            await loadCheckpoints();
            if (selectedCheckpoint === id) {
                setSelectedCheckpoint(null);
                setDiff(null);
                setPreviewFile(null);
            }
        } catch (err) {
            console.error('Failed to delete checkpoint:', err);
            showToast('error', 'Failed to delete checkpoint');
        }
    };

    // Load file preview for comparison
    const handleFileClick = async (filePath: string, oldHash?: string, newHash?: string) => {
        if (!currentProjectPath) return;

        setPreviewFile({ path: filePath, oldHash, newHash });
        setPreviewOld(null);
        setPreviewNew(null);
        setIsLoadingPreview(true);

        try {
            const promises: Promise<void>[] = [];

            if (oldHash) {
                promises.push(
                    api.readCheckpointFile(currentProjectPath, oldHash, filePath)
                        .then(content => setPreviewOld(content))
                        .catch(() => setPreviewOld(null))
                );
            }
            if (newHash) {
                promises.push(
                    api.readCheckpointFile(currentProjectPath, newHash, filePath)
                        .then(content => setPreviewNew(content))
                        .catch(() => setPreviewNew(null))
                );
            }

            await Promise.all(promises);
        } finally {
            setIsLoadingPreview(false);
        }
    };

    if (isLoading) {
        return <div className="checkpoint-view__loading">Loading checkpoints...</div>;
    }

    const progressPercent = createProgress && createProgress.total > 0
        ? Math.round((createProgress.current / createProgress.total) * 100)
        : 0;

    return (
        <div className="checkpoint-view">
            <div className="checkpoint-view__header">
                <h2>Project History</h2>
                <form className="checkpoint-view__create" onSubmit={handleCreateCheckpoint}>
                    <input
                        type="text"
                        placeholder="Checkpoint message..."
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        className="input"
                        disabled={isCreating}
                    />
                    <button type="submit" className="btn btn--primary" disabled={!message.trim() || isCreating}>
                        {isCreating ? 'Saving...' : 'Create Checkpoint'}
                    </button>
                </form>
            </div>

            {/* Progress bar during creation */}
            {isCreating && createProgress && (
                <div className="checkpoint-progress">
                    <div className="checkpoint-progress__info">
                        <span>{createProgress.phase}</span>
                        {createProgress.total > 0 && (
                            <span>{createProgress.current}/{createProgress.total} files ({progressPercent}%)</span>
                        )}
                    </div>
                    <div className="checkpoint-progress__bar">
                        <div
                            className="checkpoint-progress__fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            )}

            <div className="checkpoint-view__content">
                <div className="checkpoint-view__list">
                    {checkpoints.length === 0 ? (
                        <div className="checkpoint-view__empty">
                            No checkpoints yet. Create one to save your progress!
                        </div>
                    ) : (
                        checkpoints.map((cp, idx) => {
                            const cpDiff = diffCache[cp.id];
                            const isInitial = idx === checkpoints.length - 1;
                            return (
                                <div
                                    key={cp.id}
                                    className={`checkpoint-item ${selectedCheckpoint === cp.id ? 'checkpoint-item--selected' : ''}`}
                                    onClick={() => setSelectedCheckpoint(
                                        selectedCheckpoint === cp.id ? null : cp.id
                                    )}
                                >
                                    <div className="checkpoint-item__marker" />
                                    <div className="checkpoint-item__content">
                                        <div className="checkpoint-item__header">
                                            <span className="checkpoint-item__message">{cp.message}</span>
                                            <span className="checkpoint-item__date">
                                                {new Date(cp.timestamp).toLocaleString()}
                                            </span>
                                        </div>

                                        {/* Tags */}
                                        {cp.tags.length > 0 && (
                                            <div className="checkpoint-item__tags">
                                                {cp.tags.map(tag => (
                                                    <span key={tag} className="checkpoint-tag">{tag}</span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Change summary on card */}
                                        <div className="checkpoint-item__summary">
                                            {isInitial ? (
                                                <span className="checkpoint-summary__initial">
                                                    Initial ({Object.keys(cp.file_manifest).length} files)
                                                </span>
                                            ) : cpDiff ? (
                                                <>
                                                    {cpDiff.added.length > 0 && (
                                                        <span className="diff-stat diff-stat--added diff-stat--sm">+{cpDiff.added.length}</span>
                                                    )}
                                                    {cpDiff.modified.length > 0 && (
                                                        <span className="diff-stat diff-stat--modified diff-stat--sm">~{cpDiff.modified.length}</span>
                                                    )}
                                                    {cpDiff.deleted.length > 0 && (
                                                        <span className="diff-stat diff-stat--deleted diff-stat--sm">-{cpDiff.deleted.length}</span>
                                                    )}
                                                    {cpDiff.added.length === 0 && cpDiff.modified.length === 0 && cpDiff.deleted.length === 0 && (
                                                        <span className="checkpoint-summary__no-changes">No changes</span>
                                                    )}
                                                </>
                                            ) : null}
                                        </div>

                                        <div className="checkpoint-item__actions">
                                            <button
                                                className="btn btn--ghost btn--icon"
                                                title="Restore this state"
                                                onClick={(e) => { e.stopPropagation(); handleRestore(cp.id); }}
                                            >
                                                <span dangerouslySetInnerHTML={{ __html: getIcon('refresh') }} />
                                            </button>
                                            <button
                                                className="btn btn--ghost btn--icon btn--danger"
                                                title="Delete checkpoint"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(cp.id); }}
                                            >
                                                <span dangerouslySetInnerHTML={{ __html: getIcon('trash') }} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="checkpoint-view__details">
                    {selectedCheckpoint ? (
                        <div className="checkpoint-details">
                            {isComparing ? (
                                <div className="checkpoint-details__loading">Calculating differences...</div>
                            ) : diff ? (
                                <div className="checkpoint-diff">
                                    <div className="checkpoint-diff__header">
                                        <h3>Changed Files</h3>
                                        <div className="checkpoint-diff__stats">
                                            {diff.added.length > 0 && (
                                                <span className="diff-stat diff-stat--added">+{diff.added.length} added</span>
                                            )}
                                            {diff.modified.length > 0 && (
                                                <span className="diff-stat diff-stat--modified">~{diff.modified.length} modified</span>
                                            )}
                                            {diff.deleted.length > 0 && (
                                                <span className="diff-stat diff-stat--deleted">-{diff.deleted.length} deleted</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="checkpoint-diff__list">
                                        {diff.added.map(f => (
                                            <div
                                                key={f.path}
                                                className={`diff-file diff-file--added ${previewFile?.path === f.path ? 'diff-file--active' : ''}`}
                                                onClick={() => handleFileClick(f.path, undefined, f.hash)}
                                                title={f.path}
                                            >
                                                <span className="diff-file__badge diff-file__badge--added">A</span>
                                                <span className="diff-file__name">{getFileName(f.path)}</span>
                                                <span className="diff-file__path-hint">{f.path}</span>
                                                <span className="diff-file__size">{formatSize(f.size)}</span>
                                            </div>
                                        ))}
                                        {diff.modified.map(([old, curr]) => (
                                            <div
                                                key={curr.path}
                                                className={`diff-file diff-file--modified ${previewFile?.path === curr.path ? 'diff-file--active' : ''}`}
                                                onClick={() => handleFileClick(curr.path, old.hash, curr.hash)}
                                                title={curr.path}
                                            >
                                                <span className="diff-file__badge diff-file__badge--modified">M</span>
                                                <span className="diff-file__name">{getFileName(curr.path)}</span>
                                                <span className="diff-file__path-hint">{curr.path}</span>
                                                <span className="diff-file__size">{formatSize(curr.size)}</span>
                                            </div>
                                        ))}
                                        {diff.deleted.map(f => (
                                            <div
                                                key={f.path}
                                                className={`diff-file diff-file--deleted ${previewFile?.path === f.path ? 'diff-file--active' : ''}`}
                                                onClick={() => handleFileClick(f.path, f.hash, undefined)}
                                                title={f.path}
                                            >
                                                <span className="diff-file__badge diff-file__badge--deleted">D</span>
                                                <span className="diff-file__name">{getFileName(f.path)}</span>
                                                <span className="diff-file__path-hint">{f.path}</span>
                                                <span className="diff-file__size">{formatSize(f.size)}</span>
                                            </div>
                                        ))}
                                        {diff.added.length === 0 && diff.modified.length === 0 && diff.deleted.length === 0 && (
                                            <div className="checkpoint-diff__empty">No file changes detected.</div>
                                        )}
                                    </div>

                                    {/* File preview comparison */}
                                    {previewFile && (
                                        <div className="checkpoint-preview">
                                            <div className="checkpoint-preview__header">
                                                <h4>{getFileName(previewFile.path)}</h4>
                                                <button
                                                    className="btn btn--ghost btn--icon"
                                                    onClick={() => { setPreviewFile(null); setPreviewOld(null); setPreviewNew(null); }}
                                                    title="Close preview"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            {isLoadingPreview ? (
                                                <div className="checkpoint-preview__loading">Loading preview...</div>
                                            ) : (
                                                <div className="checkpoint-preview__compare">
                                                    {/* Old version */}
                                                    {previewFile.oldHash && (
                                                        <div className="checkpoint-preview__side">
                                                            <div className="checkpoint-preview__label checkpoint-preview__label--old">Before</div>
                                                            <PreviewContent content={previewOld} />
                                                        </div>
                                                    )}
                                                    {/* New version */}
                                                    {previewFile.newHash && (
                                                        <div className="checkpoint-preview__side">
                                                            <div className="checkpoint-preview__label checkpoint-preview__label--new">After</div>
                                                            <PreviewContent content={previewNew} />
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="checkpoint-details__info">
                                    <p className="text-muted italic">Loading changes...</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="checkpoint-view__placeholder">
                            Select a checkpoint to view changes.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/** Render preview content based on type */
const PreviewContent: React.FC<{ content: CheckpointFileContent | null }> = ({ content }) => {
    if (!content) {
        return <div className="checkpoint-preview__empty">Not available</div>;
    }

    switch (content.type) {
        case 'image':
            return (
                <div className="checkpoint-preview__image">
                    <img
                        src={content.data.startsWith('data:') ? content.data : `data:image/png;base64,${content.data}`}
                        alt="Preview"
                    />
                    {content.width > 0 && (
                        <span className="checkpoint-preview__dimensions">{content.width}x{content.height}</span>
                    )}
                </div>
            );
        case 'text':
            return (
                <pre className="checkpoint-preview__text">{content.data}</pre>
            );
        case 'binary':
            return (
                <div className="checkpoint-preview__binary">
                    Binary file ({formatSize(content.size)})
                </div>
            );
    }
};
