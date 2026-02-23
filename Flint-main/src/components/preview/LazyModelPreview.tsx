/**
 * Lazy-loaded ModelPreview Component
 *
 * This component lazy-loads the Three.js 3D viewer to reduce initial bundle size.
 * Three.js is ~600KB and only needed when viewing 3D models.
 */

import { lazy, Suspense } from 'react';

// Lazy load the ModelPreview component (named export)
const ModelPreview = lazy(() => import('./ModelPreview').then(module => ({ default: module.ModelPreview })));

interface LazyModelPreviewProps {
    filePath: string;
    meshType?: 'skinned' | 'static';
}

export default function LazyModelPreview(props: LazyModelPreviewProps) {
    return (
        <Suspense
            fallback={
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    width: '100%',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '8px' }}>🎨</div>
                        <div>Loading 3D viewer...</div>
                    </div>
                </div>
            }
        >
            <ModelPreview {...props} />
        </Suspense>
    );
}
