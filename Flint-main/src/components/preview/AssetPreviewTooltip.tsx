/**
 * Flint - Asset Preview Tooltip Component
 * 
 * Shows a preview of textures (.tex, .dds) or meshes (.scb, .sco, .skn)
 * when hovering over asset path strings in the BIN editor.
 */

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import * as api from '../../lib/api';

interface AssetPreviewTooltipProps {
    /** The asset path to preview (e.g., "ASSETS/Characters/...") */
    assetPath: string;
    /** Base path to resolve relative asset paths */
    basePath: string;
    /** Position to display the tooltip */
    position: { x: number; y: number };
    /** Whether the tooltip is visible */
    visible: boolean;
    /** Callback when tooltip should close */
    onClose?: () => void;
}

/** Mesh data format from API */
interface MeshData {
    positions: number[];
    indices: number[];
    materials: string[] | { name: string }[];
}

type PreviewState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'texture'; data: string; width: number; height: number; format: string }
    | { status: 'mesh'; meshData: MeshData; vertexCount: number; faceCount: number };

/**
 * Determines the asset type from the file path
 */
function getAssetType(path: string): 'texture' | 'mesh' | 'unknown' {
    const ext = path.toLowerCase().split('.').pop() || '';
    if (['tex', 'dds'].includes(ext)) {
        return 'texture';
    }
    if (['scb', 'sco', 'skn'].includes(ext)) {
        return 'mesh';
    }
    return 'unknown';
}

/**
 * Mini 3D mesh preview component using Three.js
 */
const MiniMeshPreview: React.FC<{ meshData: MeshData }> = ({ meshData }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<{
        renderer: THREE.WebGLRenderer;
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        mesh: THREE.Mesh;
        animationId: number;
    } | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !meshData.positions.length) return;

        // Create scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1b1b1b);

        // Create camera
        const camera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 1000);

        // Create renderer
        const renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });
        renderer.setSize(canvas.width, canvas.height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Create geometry from mesh data
        const geometry = new THREE.BufferGeometry();

        // Add positions
        const posArray = new Float32Array(meshData.positions);
        geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

        // Add indices
        const indexArray = new Uint32Array(meshData.indices);
        geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));

        // Compute normals for lighting
        geometry.computeVertexNormals();

        // Center the geometry
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox!.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);

        // Calculate size for camera positioning
        const size = new THREE.Vector3();
        geometry.boundingBox!.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        // Create material
        const material = new THREE.MeshStandardMaterial({
            color: 0x6699cc,
            roughness: 0.7,
            metalness: 0.2,
            flatShading: false
        });

        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
        backLight.position.set(-1, -1, -1);
        scene.add(backLight);

        // Position camera
        camera.position.set(0, 0, maxDim * 2.5);
        camera.lookAt(0, 0, 0);

        // Animation loop - auto-rotate
        let rotation = 0;
        const animate = () => {
            const id = requestAnimationFrame(animate);
            sceneRef.current!.animationId = id;

            rotation += 0.015;
            mesh.rotation.y = rotation;

            renderer.render(scene, camera);
        };

        sceneRef.current = { renderer, scene, camera, mesh, animationId: 0 };
        animate();

        // Cleanup
        return () => {
            if (sceneRef.current) {
                cancelAnimationFrame(sceneRef.current.animationId);
                sceneRef.current.renderer.dispose();
                geometry.dispose();
                material.dispose();
            }
        };
    }, [meshData]);

    return (
        <canvas
            ref={canvasRef}
            width={180}
            height={140}
            className="asset-preview-tooltip__mesh-canvas"
        />
    );
};

export const AssetPreviewTooltip: React.FC<AssetPreviewTooltipProps> = ({
    assetPath,
    basePath,
    position,
    visible
}) => {
    const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });
    const [resolvedPath, setResolvedPath] = useState<string>('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Load preview when asset path changes
    useEffect(() => {
        if (!visible || !assetPath) {
            return;
        }

        setPreview({ status: 'loading' });
        setResolvedPath('');

        const assetType = getAssetType(assetPath);

        const loadPreview = async () => {
            try {
                // Use backend to resolve the asset path (searches WAD folders, etc.)
                const fullPath = await api.resolveAssetPath(assetPath, basePath);
                setResolvedPath(fullPath);
                console.log('[AssetPreview] Resolved:', assetPath, '->', fullPath);

                if (assetType === 'texture') {
                    const result = await api.decodeDdsToPng(fullPath);
                    setPreview({
                        status: 'texture',
                        data: result.data,
                        width: result.width,
                        height: result.height,
                        format: result.format
                    });
                } else if (assetType === 'mesh') {
                    const ext = assetPath.toLowerCase().split('.').pop() || '';
                    let meshData: MeshData;

                    if (ext === 'skn') {
                        const mesh = await api.readSknMesh(fullPath);
                        // Flatten positions from [x,y,z][] to number[]
                        const flatPositions = mesh.positions.flat();
                        meshData = {
                            positions: flatPositions,
                            indices: mesh.indices,
                            materials: mesh.materials
                        };
                    } else {
                        const mesh = await api.readScbMesh(fullPath);
                        // Flatten positions from [x,y,z][] to number[]
                        const flatPositions = mesh.positions.flat();
                        meshData = {
                            positions: flatPositions,
                            indices: mesh.indices,
                            materials: mesh.materials
                        };
                    }

                    setPreview({
                        status: 'mesh',
                        meshData,
                        vertexCount: meshData.positions.length / 3,
                        faceCount: Math.floor(meshData.indices.length / 3)
                    });
                } else {
                    setPreview({ status: 'error', message: 'Unknown asset type' });
                }
            } catch (err) {
                console.error('[AssetPreviewTooltip] Failed to load:', err);
                setPreview({
                    status: 'error',
                    message: (err as Error).message || 'Failed to load asset'
                });
            }
        };

        loadPreview();
    }, [assetPath, basePath, visible]);

    if (!visible) {
        return null;
    }

    // Calculate position to stay within viewport
    const tooltipWidth = 260;
    const tooltipHeight = 240;
    const margin = 20;

    let left = position.x + margin;
    let top = position.y - tooltipHeight / 2;

    // Adjust if going off-screen
    if (left + tooltipWidth > window.innerWidth) {
        left = position.x - tooltipWidth - margin;
    }
    if (top < margin) {
        top = margin;
    }
    if (top + tooltipHeight > window.innerHeight - margin) {
        top = window.innerHeight - tooltipHeight - margin;
    }

    return (
        <div
            ref={containerRef}
            className="asset-preview-tooltip"
            style={{
                position: 'fixed',
                left,
                top,
                zIndex: 9999,
                pointerEvents: 'none'
            }}
        >
            {/* Header with file name */}
            <div className="asset-preview-tooltip__header">
                {assetPath.split(/[/\\]/).pop()}
            </div>

            {/* Preview content */}
            <div className="asset-preview-tooltip__content">
                {preview.status === 'loading' && (
                    <div className="asset-preview-tooltip__loading">
                        <div className="spinner spinner--sm" />
                        <span>Loading...</span>
                    </div>
                )}

                {preview.status === 'error' && (
                    <div className="asset-preview-tooltip__error">
                        <span className="asset-preview-tooltip__error-icon">⚠️</span>
                        <span>{preview.message}</span>
                    </div>
                )}

                {preview.status === 'texture' && (
                    <div className="asset-preview-tooltip__texture">
                        <img
                            src={`data:image/png;base64,${preview.data}`}
                            alt={assetPath}
                            style={{
                                maxWidth: '200px',
                                maxHeight: '160px',
                                objectFit: 'contain',
                                borderRadius: '4px',
                                background: 'repeating-conic-gradient(var(--bg-tertiary) 0% 25%, var(--bg-primary) 0% 50%) 50% / 10px 10px'
                            }}
                        />
                        <div className="asset-preview-tooltip__info">
                            {preview.width}×{preview.height} • {preview.format}
                        </div>
                    </div>
                )}

                {preview.status === 'mesh' && (
                    <div className="asset-preview-tooltip__mesh">
                        <MiniMeshPreview meshData={preview.meshData} />
                        <div className="asset-preview-tooltip__mesh-stats">
                            {preview.vertexCount.toLocaleString()} verts • {preview.faceCount.toLocaleString()} tris
                        </div>
                    </div>
                )}
            </div>

            {/* Footer with full path */}
            <div className="asset-preview-tooltip__footer">
                {resolvedPath.split('\\').slice(-2).join('\\')}
            </div>
        </div>
    );
};

export default AssetPreviewTooltip;
