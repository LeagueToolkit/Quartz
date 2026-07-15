import { invokeCommand } from './core';

export interface ModelGroup {
    name: string;
    indexStart: number;
    indexCount: number;
}

export interface ModelPreviewData {
    name: string;
    kind: 'static' | 'skinned';
    version: string;
    positions: number[];
    normals: number[];
    uvs: number[];
    colors: number[];
    indices: number[];
    groups: ModelGroup[];
    vertexCount: number;
    triangleCount: number;
    suggestedTexture: string | null;
}

/** Parse SCB/SCO/SKN natively and return WebGL-ready buffers. */
export function modelInspectLoad(path: string): Promise<ModelPreviewData> {
    return invokeCommand<ModelPreviewData>('model_inspect_load', { path });
}
