/**
 * Flint - Text Preview Component
 */

import React, { useState, useEffect } from 'react';
import * as api from '../../lib/api';
import { getIcon } from '../../lib/fileIcons';

interface TextPreviewProps {
    filePath: string;
}

export const TextPreview: React.FC<TextPreviewProps> = ({ filePath }) => {
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    const MAX_LINES = 1000;

    useEffect(() => {
        const loadText = async () => {
            setLoading(true);
            setError(null);

            try {
                const text = await api.readTextFile(filePath);
                const lines = text.split('\n');

                if (lines.length > MAX_LINES) {
                    setContent(lines.slice(0, MAX_LINES).join('\n'));
                    setIsTruncated(true);
                } else {
                    setContent(text);
                    setIsTruncated(false);
                }
            } catch (err) {
                console.error('[TextPreview] Error:', err);
                setError((err as Error).message || 'Failed to load text');
            } finally {
                setLoading(false);
            }
        };

        loadText();
    }, [filePath]);

    const ext = filePath.split('.').pop()?.toLowerCase() || 'txt';
    const lineNumbers = content.split('\n').map((_, i) => i + 1);

    if (loading) {
        return (
            <div className="text-preview__loading">
                <div className="spinner" />
                <span>Loading text...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-preview__error">
                <span dangerouslySetInnerHTML={{ __html: getIcon('warning') }} />
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="text-preview">
            <div className="text-preview__toolbar">
                <span className="text-preview__lang">{ext.toUpperCase()}</span>
                <span>{lineNumbers.length} lines</span>
            </div>
            <div className="text-preview__content">
                <div className="text-preview__line-numbers">
                    {lineNumbers.map((num) => (
                        <div key={num} className="text-preview__line-num">{num}</div>
                    ))}
                </div>
                <pre className="text-preview__code">
                    <code>{content}</code>
                </pre>
            </div>
            {isTruncated && (
                <div className="text-preview__truncated">
                    File truncated at {MAX_LINES} lines
                </div>
            )}
        </div>
    );
};
