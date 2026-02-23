/**
 * Flint - ModelPreview Component
 * 3D preview for SKN mesh files with material visibility controls
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import * as THREE from 'three';
import * as api from '../../lib/api';
import type { AnimationPose } from '../../lib/api';

// ============================================================================
// Types
// ============================================================================

interface MaterialRange {
    name: string;
    start_index: number;
    index_count: number;
    start_vertex: number;
    vertex_count: number;
}

interface SknMeshData {
    materials: MaterialRange[];
    positions: [number, number, number][];
    normals: [number, number, number][];
    uvs: [number, number][];
    indices: number[];
    bounding_box: [[number, number, number], [number, number, number]];
    textures?: Record<string, string>;  // DEPRECATED - use material_data
    material_data?: Record<string, MaterialData>;  // NEW: textures with UV params
    bone_weights?: [number, number, number, number][];  // 4 bone weights per vertex
    bone_indices?: [number, number, number, number][];  // 4 bone indices per vertex
}

// Material data with texture and UV transform parameters
interface MaterialData {
    texture: string;           // base64 PNG
    uv_scale?: [number, number];
    uv_offset?: [number, number];
    flipbook_size?: [number, number];
    flipbook_frame?: number;
}

interface BoneData {
    name: string;
    id: number;
    parent_id: number;
    local_translation: [number, number, number];
    local_rotation: [number, number, number, number];
    local_scale: [number, number, number];
    world_position: [number, number, number];
    inverse_bind_matrix: [[number, number, number, number], [number, number, number, number], [number, number, number, number], [number, number, number, number]];
}

interface SklData {
    name: string;
    asset_name: string;
    bones: BoneData[];
    influences: number[];  // Maps vertex bone indices to actual bone IDs
}

// Static mesh data from SCB/SCO files
interface ScbMeshData {
    name: string;
    materials: string[];
    positions: [number, number, number][];
    normals: [number, number, number][];
    uvs: [number, number][];
    indices: number[];
    bounding_box: [[number, number, number], [number, number, number]];
    material_ranges: Record<string, [number, number]>;
}

// Union type for mesh data
type MeshData = SknMeshData | ScbMeshData;

interface ModelPreviewProps {
    filePath: string;
    meshType?: 'skinned' | 'static';  // skinned = SKN, static = SCB/SCO
}

// ============================================================================
// Mesh Component (renders the 3D geometry)
// ============================================================================

interface MeshViewerProps {
    meshData: MeshData;
    visibleMaterials: Set<string>;
    wireframe: boolean;
    skeletonData?: SklData | null;  // For CPU skinning
    animationPose?: AnimationPose | null;  // Current animation pose for skinning
}

// Helper to check if mesh data is SKN type
const isSknMeshDataType = (data: MeshData): data is SknMeshData => {
    return Array.isArray(data.materials) &&
        data.materials.length > 0 &&
        typeof data.materials[0] === 'object';
};


const MeshViewer: React.FC<MeshViewerProps> = ({ meshData, visibleMaterials, wireframe, skeletonData, animationPose }) => {
    const { camera } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());

    // Riot's ELF hash variant - used for bone/joint name hashing
    const elfHash = (name: string): number => {
        let hash = 0;
        const lowerName = name.toLowerCase();
        for (let i = 0; i < lowerName.length; i++) {
            hash = ((hash << 4) + lowerName.charCodeAt(i)) >>> 0;
            const high = hash & 0xF0000000;
            if (high !== 0) {
                hash ^= high >>> 24;
            }
            hash &= ~high;
        }
        return hash >>> 0;
    };



    // Compute bone transform matrices from animation pose
    // IMPORTANT: bone_indices in mesh refer to array index, NOT bone.id!
    const boneMatrices = useMemo(() => {
        if (!skeletonData) return null;

        const matrices: THREE.Matrix4[] = [];
        const worldTransforms = new Map<number, THREE.Matrix4>();

        // Build a map from bone ID to array index
        // Mesh bone_indices reference array positions, not bone IDs
        const idToIndex = new Map<number, number>();
        skeletonData.bones.forEach((bone, index) => {
            idToIndex.set(bone.id, index);
        });

        // Sort bones by ID to ensure parents are processed before children
        const sortedBones = [...skeletonData.bones].sort((a, b) => a.id - b.id);

        sortedBones.forEach(bone => {
            const localMatrix = new THREE.Matrix4();

            if (animationPose && Object.keys(animationPose.joints).length > 0) {
                // Get animation transform for this bone by hash
                const boneHash = elfHash(bone.name);
                const animTransform = animationPose.joints[boneHash];

                if (animTransform) {
                    const rotation = new THREE.Quaternion(
                        animTransform.rotation[0],
                        animTransform.rotation[1],
                        animTransform.rotation[2],
                        animTransform.rotation[3]
                    );
                    const translation = new THREE.Vector3(
                        animTransform.translation[0],
                        animTransform.translation[1],
                        animTransform.translation[2]
                    );
                    const scale = new THREE.Vector3(
                        animTransform.scale[0],
                        animTransform.scale[1],
                        animTransform.scale[2]
                    );
                    localMatrix.compose(translation, rotation, scale);
                } else {
                    // Use bind pose
                    const rotation = new THREE.Quaternion(
                        bone.local_rotation[0],
                        bone.local_rotation[1],
                        bone.local_rotation[2],
                        bone.local_rotation[3]
                    );
                    const translation = new THREE.Vector3(
                        bone.local_translation[0],
                        bone.local_translation[1],
                        bone.local_translation[2]
                    );
                    const scale = new THREE.Vector3(
                        bone.local_scale[0],
                        bone.local_scale[1],
                        bone.local_scale[2]
                    );
                    localMatrix.compose(translation, rotation, scale);
                }
            } else {
                // Use bind pose
                const rotation = new THREE.Quaternion(
                    bone.local_rotation[0],
                    bone.local_rotation[1],
                    bone.local_rotation[2],
                    bone.local_rotation[3]
                );
                const translation = new THREE.Vector3(
                    bone.local_translation[0],
                    bone.local_translation[1],
                    bone.local_translation[2]
                );
                const scale = new THREE.Vector3(
                    bone.local_scale[0],
                    bone.local_scale[1],
                    bone.local_scale[2]
                );
                localMatrix.compose(translation, rotation, scale);
            }

            // Compute world transform
            let worldMatrix: THREE.Matrix4;
            if (bone.parent_id >= 0 && worldTransforms.has(bone.parent_id)) {
                const parentWorld = worldTransforms.get(bone.parent_id)!;
                worldMatrix = new THREE.Matrix4().multiplyMatrices(parentWorld, localMatrix);
            } else {
                worldMatrix = localMatrix.clone();
            }
            worldTransforms.set(bone.id, worldMatrix);

            // Compute final skinning matrix: world * inverse_bind
            // Create inverse bind matrix from the stored column-major array
            const invBind = bone.inverse_bind_matrix;
            const invBindMatrix = new THREE.Matrix4().set(
                invBind[0][0], invBind[1][0], invBind[2][0], invBind[3][0],
                invBind[0][1], invBind[1][1], invBind[2][1], invBind[3][1],
                invBind[0][2], invBind[1][2], invBind[2][2], invBind[3][2],
                invBind[0][3], invBind[1][3], invBind[2][3], invBind[3][3]
            );

            const skinMatrix = new THREE.Matrix4().multiplyMatrices(worldMatrix, invBindMatrix);

            // Store by array index, NOT bone.id - mesh bone_indices are array positions
            const arrayIndex = idToIndex.get(bone.id)!;
            matrices[arrayIndex] = skinMatrix;
        });

        return matrices;
    }, [skeletonData, animationPose]);

    // Apply skinning to vertex positions
    const applySkinnedPositions = (
        originalPositions: [number, number, number][],
        indices: number[],
        startIdx: number,
        count: number
    ): number[] => {
        const skinnedPositions: number[] = [];
        const sknData = meshData as SknMeshData;

        // Build mapping from bone ID to array index (for looking up boneMatrices)
        const boneIdToArrayIndex = new Map<number, number>();
        if (skeletonData) {
            skeletonData.bones.forEach((bone, index) => {
                boneIdToArrayIndex.set(bone.id, index);
            });
        }

        for (let i = 0; i < count; i++) {
            const vertexIdx = indices[startIdx + i];
            const pos = originalPositions[vertexIdx];
            const originalPos = new THREE.Vector3(pos[0], pos[1], pos[2]);

            // Check if we have skinning data
            if (boneMatrices && sknData.bone_weights && sknData.bone_indices && skeletonData?.influences) {
                const weights = sknData.bone_weights[vertexIdx];
                const boneIdx = sknData.bone_indices[vertexIdx];

                // Apply weighted bone transforms
                const skinnedPos = new THREE.Vector3(0, 0, 0);
                let totalWeight = 0;

                for (let j = 0; j < 4; j++) {
                    const weight = weights[j];
                    // Remap: vertex bone index -> influences array -> bone ID -> bone array index
                    const influenceIdx = boneIdx[j];
                    const boneId = skeletonData.influences[influenceIdx];
                    const boneArrayIndex = boneIdToArrayIndex.get(boneId) ?? influenceIdx;

                    if (weight > 0.0001 && boneMatrices[boneArrayIndex]) {
                        const transformedPos = originalPos.clone().applyMatrix4(boneMatrices[boneArrayIndex]);
                        skinnedPos.addScaledVector(transformedPos, weight);
                        totalWeight += weight;
                    }
                }

                // If we have valid skinning, use it; otherwise fall back to original position
                if (totalWeight > 0.0001) {
                    // Normalize if weights don't sum to 1 (edge case)
                    if (Math.abs(totalWeight - 1.0) > 0.01) {
                        skinnedPos.divideScalar(totalWeight);
                    }
                    skinnedPositions.push(skinnedPos.x, skinnedPos.y, skinnedPos.z);
                } else {
                    // No valid bone transforms - use original position
                    skinnedPositions.push(pos[0], pos[1], pos[2]);
                }
            } else {
                // No skinning data - use original position
                skinnedPositions.push(pos[0], pos[1], pos[2]);
            }
        }

        return skinnedPositions;
    };

    // Create base geometries with skinning data (non-indexed for proper UV mapping)
    const materialGeometries = useMemo(() => {
        const geometries: Map<string, { geo: THREE.BufferGeometry; startIdx: number; count: number }> = new Map();

        if (isSknMeshDataType(meshData)) {
            meshData.materials.forEach((mat) => {
                const geo = new THREE.BufferGeometry();
                const startIdx = mat.start_index;
                const count = mat.index_count;

                // Extract triangle data
                const positions: number[] = [];
                const normals: number[] = [];
                const uvs: number[] = [];

                for (let i = 0; i < count; i++) {
                    const idx = meshData.indices[startIdx + i];

                    positions.push(meshData.positions[idx][0], meshData.positions[idx][1], meshData.positions[idx][2]);
                    normals.push(meshData.normals[idx][0], meshData.normals[idx][1], meshData.normals[idx][2]);
                    uvs.push(meshData.uvs[idx][0], meshData.uvs[idx][1]);
                }

                geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
                geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
                geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));

                geometries.set(mat.name, { geo, startIdx, count });
            });
        } else {
            const scbData = meshData as ScbMeshData;
            const geo = new THREE.BufferGeometry();

            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(scbData.positions.flat()), 3));
            geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(scbData.normals.flat()), 3));
            geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(scbData.uvs.flat()), 2));
            geo.setIndex(new THREE.BufferAttribute(new Uint32Array(scbData.indices), 1));

            const matKey = scbData.materials[0] || 'default';
            geometries.set(matKey, { geo, startIdx: 0, count: scbData.indices.length });
        }

        return geometries;
    }, [meshData]);

    // Update positions when animation pose changes
    useEffect(() => {
        if (!isSknMeshDataType(meshData) || !boneMatrices) return;

        materialGeometries.forEach(({ geo, startIdx, count }, _matName) => {
            const skinnedPositions = applySkinnedPositions(
                meshData.positions,
                meshData.indices,
                startIdx,
                count
            );

            const positionAttribute = geo.getAttribute('position') as THREE.BufferAttribute;
            positionAttribute.array.set(skinnedPositions);
            positionAttribute.needsUpdate = true;
            geo.computeBoundingSphere();
        });
    }, [animationPose, boneMatrices, meshData, materialGeometries]);

    // Create material groups for visibility control
    const materialGroups = useMemo(() => {
        if (isSknMeshDataType(meshData)) {
            return meshData.materials.map((mat, index) => ({
                name: mat.name,
                visible: visibleMaterials.has(mat.name),
                color: new THREE.Color().setHSL((index * 0.618033988749895) % 1, 0.7, 0.5),
            }));
        } else {
            const scbData = meshData as ScbMeshData;
            const matName = scbData.materials[0] || 'default';
            return [{
                name: matName,
                visible: visibleMaterials.has(matName),
                color: new THREE.Color().setHSL(0.5, 0.7, 0.5),
            }];
        }
    }, [meshData, visibleMaterials]);

    // Load textures from the backend-provided material_data (with UV transforms)
    const textureCache = useMemo(() => {
        const cache = new Map<string, THREE.Texture>();
        const textureLoader = new THREE.TextureLoader();

        console.log('=== SKN Material Data Loading ===');

        if (isSknMeshDataType(meshData)) {
            console.log('Materials from SKN:', meshData.materials.map(m => m.name));

            // Prefer material_data (new) over textures (deprecated)
            if (meshData.material_data && Object.keys(meshData.material_data).length > 0) {
                console.log('Material data from backend:', Object.keys(meshData.material_data));

                for (const [materialName, matData] of Object.entries(meshData.material_data)) {
                    try {
                        const dataUrl = `data:image/png;base64,${matData.texture}`;
                        const texture = textureLoader.load(dataUrl);

                        // CRITICAL: Do NOT flip Y - League meshes have reversed normals
                        texture.flipY = false;
                        texture.colorSpace = THREE.SRGBColorSpace;

                        // Apply UV transformations from material properties
                        if (matData.uv_scale) {
                            texture.repeat.set(matData.uv_scale[0], matData.uv_scale[1]);
                            console.log(`  UV Scale for "${materialName}": [${matData.uv_scale[0]}, ${matData.uv_scale[1]}]`);
                        }

                        if (matData.uv_offset) {
                            texture.offset.set(matData.uv_offset[0], matData.uv_offset[1]);
                            console.log(`  UV Offset for "${materialName}": [${matData.uv_offset[0]}, ${matData.uv_offset[1]}]`);
                        }

                        // Handle flipbook materials
                        if (matData.flipbook_size) {
                            const [cols, rows] = matData.flipbook_size;
                            const frame = matData.flipbook_frame || 0;

                            // Calculate which cell to show in the atlas
                            const col = Math.floor(frame % cols);
                            const row = Math.floor(frame / cols);

                            // Set repeat to show only one cell
                            texture.repeat.set(1 / cols, 1 / rows);

                            // Set offset to the correct cell (UV origin is bottom-left)
                            // For row 0, we want offset.y = 1 - 1/rows (top row)
                            texture.offset.set(col / cols, 1 - (row + 1) / rows);

                            console.log(`  Flipbook for "${materialName}": ${cols}x${rows} grid, frame ${frame} (cell [${col}, ${row}])`);
                        }

                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.needsUpdate = true;

                        cache.set(materialName, texture);
                        console.log(`✓ Loaded material data for "${materialName}"`);
                    } catch (error) {
                        console.warn(`✗ Failed to load material data for "${materialName}":`, error);
                    }
                }
            } else if (meshData.textures) {
                // Fallback to deprecated textures field for backward compatibility
                console.log('Using deprecated textures field:', Object.keys(meshData.textures));
                for (const [materialName, base64Data] of Object.entries(meshData.textures)) {
                    try {
                        const dataUrl = `data:image/png;base64,${base64Data}`;
                        const texture = textureLoader.load(dataUrl);
                        texture.flipY = false;
                        texture.colorSpace = THREE.SRGBColorSpace;
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;

                        cache.set(materialName, texture);
                        console.log(`✓ Loaded texture for "${materialName}" (deprecated path)`);
                    } catch (error) {
                        console.warn(`✗ Failed to load texture for "${materialName}":`, error);
                    }
                }
            }
        }

        return cache;
    }, [meshData]);

    // Create materials with proper texture assignment
    console.log('=== Material Assignment ===');
    const findTextureForMaterial = (materialName: string): THREE.Texture | null => {
        // Direct lookup - backend already resolved the naming
        const texture = textureCache.get(materialName);

        if (texture) {
            return texture;
        }

        // Fallback: Try stripping "mesh_" prefix for compatibility
        if (materialName.startsWith("mesh_")) {
            const stripped = materialName.substring(5);
            const strippedTexture = textureCache.get(stripped);
            if (strippedTexture) {
                return strippedTexture;
            }
        }

        return null;
    };

    // Center camera on mesh
    useEffect(() => {
        const [[minX, minY, minZ], [maxX, maxY, maxZ]] = meshData.bounding_box;
        const center = new THREE.Vector3(
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
        );
        const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

        if (camera instanceof THREE.PerspectiveCamera) {
            camera.position.set(center.x, center.y, center.z + size * 2);
            camera.lookAt(center);
        }
    }, [meshData.bounding_box, camera]);

    // Debug: Log material matching on first render
    useEffect(() => {
        if (isSknMeshDataType(meshData)) {
            console.log('=== Material Texture Matching ===');
            meshData.materials.forEach((mat, idx) => {
                const texture = textureCache.get(mat.name);

                if (texture) {
                    console.log(`  ${idx}. "${mat.name}" → ✓ Texture assigned`);
                } else {
                    console.warn(`  ${idx}. "${mat.name}" → ✗ NO TEXTURE (using magenta)`);
                }
            });
            console.log('===========================');
        }
    }, [meshData, textureCache]);

    return (
        <group ref={groupRef}>
            {materialGroups.map((mat, index) => {
                if (!mat.visible) return null;

                const geoData = materialGeometries.get(mat.name);
                if (!geoData) return null;

                // Use fuzzy matching to find the texture for this material
                const matchedTexture = findTextureForMaterial(mat.name);

                return (
                    <mesh
                        key={mat.name || index}
                        geometry={geoData.geo}
                        ref={(mesh) => { if (mesh) meshRefs.current.set(mat.name, mesh); }}
                    >
                        <meshStandardMaterial
                            map={matchedTexture || null}
                            // Use magenta for missing textures to make them obvious
                            color={matchedTexture ? 0xffffff : 0xff00ff}
                            wireframe={wireframe}
                            side={THREE.DoubleSide}
                            flatShading={false}
                        />
                    </mesh>
                );
            })}
        </group>
    );
};


// ============================================================================
// Skeleton Viewer Component (renders bone lines)
// ============================================================================

interface SkeletonViewerProps {
    skeletonData: SklData;
    animationPose?: AnimationPose | null;
}

const SkeletonViewer: React.FC<SkeletonViewerProps> = ({ skeletonData, animationPose }) => {
    // Riot's ELF hash variant - used for bone/joint name hashing in League files
    const elfHash = (name: string): number => {
        let hash = 0;
        const lowerName = name.toLowerCase();
        for (let i = 0; i < lowerName.length; i++) {
            hash = ((hash << 4) + lowerName.charCodeAt(i)) >>> 0;
            const high = hash & 0xF0000000;
            if (high !== 0) {
                hash ^= high >>> 24;
            }
            hash &= ~high;
        }
        return hash >>> 0; // unsigned 32-bit
    };

    // Build a map from bone id to its name hash for quick lookup
    const boneIdToHash = useMemo(() => {
        const map = new Map<number, number>();
        skeletonData.bones.forEach(bone => {
            const hash = elfHash(bone.name);
            map.set(bone.id, hash);
        });

        // Debug: log first time to check hash matching
        if (skeletonData.bones.length > 0) {
            const firstBone = skeletonData.bones[0];
            const firstHash = elfHash(firstBone.name);
            console.log('[SkeletonViewer] First bone:', firstBone.name, 'hash:', firstHash);
        }

        return map;
    }, [skeletonData]);

    // Compute bone positions - use animation pose if available, otherwise bind pose
    const bonePositions = useMemo(() => {
        const positions: Record<number, THREE.Vector3> = {};

        if (animationPose && Object.keys(animationPose.joints).length > 0) {
            // Debug: log animation joint hashes on first pose
            const jointHashes = Object.keys(animationPose.joints).map(k => parseInt(k));
            console.log('[SkeletonViewer] Animation joint hashes (first 5):', jointHashes.slice(0, 5));

            // Check how many bones match
            let matchCount = 0;
            skeletonData.bones.forEach(bone => {
                const boneHash = boneIdToHash.get(bone.id);
                if (boneHash !== undefined && animationPose.joints[boneHash]) {
                    matchCount++;
                }
            });
            console.log('[SkeletonViewer] Bones with animation data:', matchCount, '/', skeletonData.bones.length);

            // Build hierarchy of animated transforms
            const worldTransforms = new Map<number, THREE.Matrix4>();

            // Sort bones by parent dependency (parents before children)
            const sortedBones = [...skeletonData.bones].sort((a, b) => a.id - b.id);

            sortedBones.forEach(bone => {
                const localMatrix = new THREE.Matrix4();

                // Get the hash for this bone and look up animation transform
                const boneHash = boneIdToHash.get(bone.id);
                const animTransform = boneHash !== undefined ? animationPose.joints[boneHash] : undefined;

                if (animTransform) {
                    // Use animation transform
                    const rotation = new THREE.Quaternion(
                        animTransform.rotation[0],
                        animTransform.rotation[1],
                        animTransform.rotation[2],
                        animTransform.rotation[3]
                    );
                    const translation = new THREE.Vector3(
                        animTransform.translation[0],
                        animTransform.translation[1],
                        animTransform.translation[2]
                    );
                    const scale = new THREE.Vector3(
                        animTransform.scale[0],
                        animTransform.scale[1],
                        animTransform.scale[2]
                    );
                    localMatrix.compose(translation, rotation, scale);
                } else {
                    // Use bind pose local transform
                    const rotation = new THREE.Quaternion(
                        bone.local_rotation[0],
                        bone.local_rotation[1],
                        bone.local_rotation[2],
                        bone.local_rotation[3]
                    );
                    const translation = new THREE.Vector3(
                        bone.local_translation[0],
                        bone.local_translation[1],
                        bone.local_translation[2]
                    );
                    const scale = new THREE.Vector3(
                        bone.local_scale[0],
                        bone.local_scale[1],
                        bone.local_scale[2]
                    );
                    localMatrix.compose(translation, rotation, scale);
                }

                // Multiply by parent world transform
                if (bone.parent_id >= 0 && worldTransforms.has(bone.parent_id)) {
                    const parentWorld = worldTransforms.get(bone.parent_id)!;
                    const worldMatrix = new THREE.Matrix4().multiplyMatrices(parentWorld, localMatrix);
                    worldTransforms.set(bone.id, worldMatrix);
                } else {
                    worldTransforms.set(bone.id, localMatrix);
                }

                // Extract position from world transform
                const worldMatrix = worldTransforms.get(bone.id)!;
                const pos = new THREE.Vector3();
                pos.setFromMatrixPosition(worldMatrix);
                positions[bone.id] = pos;
            });
        } else {
            // Use bind pose world positions
            skeletonData.bones.forEach(bone => {
                positions[bone.id] = new THREE.Vector3(
                    bone.world_position[0],
                    bone.world_position[1],
                    bone.world_position[2]
                );
            });
        }

        return positions;
    }, [skeletonData, animationPose, boneIdToHash]);

    // Create line segments for bone connections
    const linePoints = useMemo(() => {
        const points: THREE.Vector3[] = [];

        skeletonData.bones.forEach(bone => {
            if (bone.parent_id >= 0) {
                const childPos = bonePositions[bone.id];
                const parentPos = bonePositions[bone.parent_id];
                if (childPos && parentPos) {
                    points.push(parentPos, childPos);
                }
            }
        });

        return points;
    }, [skeletonData, bonePositions]);

    // Create joint spheres
    const jointPositions = useMemo(() => {
        return Object.values(bonePositions);
    }, [bonePositions]);

    return (
        <group key={animationPose?.time ?? 'bind'}>
            {/* Bone lines */}
            {linePoints.length > 0 && (
                <lineSegments>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={linePoints.length}
                            array={new Float32Array(linePoints.flatMap(p => [p.x, p.y, p.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color="#00ff00" linewidth={2} />
                </lineSegments>
            )}

            {/* Joint spheres */}
            {jointPositions.map((pos, i) => (
                <mesh key={i} position={[pos.x, pos.y, pos.z]}>
                    <sphereGeometry args={[0.02, 8, 8]} />
                    <meshBasicMaterial color="#ff0000" />
                </mesh>
            ))}
        </group>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const ModelPreview: React.FC<ModelPreviewProps> = ({ filePath, meshType = 'skinned' }) => {
    const [meshData, setMeshData] = useState<MeshData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [wireframe, setWireframe] = useState(false);
    const [visibleMaterials, setVisibleMaterials] = useState<Set<string>>(new Set());

    // Animation state (only for skinned meshes)
    const [animations, setAnimations] = useState<{ name: string; animation_path: string }[]>([]);
    const [selectedAnimation, setSelectedAnimation] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);

    // Animation playback state
    const [animationData, setAnimationData] = useState<{ duration: number; fps: number; joint_count: number; joint_hashes: number[] } | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [currentPose, setCurrentPose] = useState<AnimationPose | null>(null);
    const animationRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef<number>(0);

    // Skeleton state (only for skinned meshes)
    const [skeletonData, setSkeletonData] = useState<SklData | null>(null);
    const [showSkeleton, setShowSkeleton] = useState(true);

    // Texture preview state
    const [hoveredMaterial, setHoveredMaterial] = useState<string | null>(null);
    const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    // Helper to check if mesh data is SKN type
    const isSknMeshData = (data: MeshData): data is SknMeshData => {
        return Array.isArray((data as SknMeshData).materials) &&
            typeof (data as SknMeshData).materials[0] === 'object';
    };

    // Load mesh data
    useEffect(() => {
        let cancelled = false;

        const loadMesh = async () => {
            setLoading(true);
            setError(null);
            setAnimations([]);
            setSkeletonData(null);

            try {
                let data: MeshData;

                if (meshType === 'static') {
                    // Load SCB/SCO static mesh
                    data = await api.readScbMesh(filePath);
                    console.log('[ModelPreview] Loaded static mesh:', (data as ScbMeshData).name);
                } else {
                    // Load SKN skinned mesh AND skeleton/animations in parallel
                    // This significantly reduces loading time by parallelizing independent requests
                    const sklPath = filePath.replace(/\.skn$/i, '.skl');

                    const [meshResult, animResult, sklResult] = await Promise.allSettled([
                        api.readSknMesh(filePath),
                        api.readAnimationList(filePath),
                        api.readSklSkeleton(sklPath)
                    ]);

                    // Handle mesh result (required)
                    if (meshResult.status === 'fulfilled') {
                        data = meshResult.value;

                        // Debug: log texture loading
                        const sknData = data as SknMeshData;
                        if (sknData.textures && Object.keys(sknData.textures).length > 0) {
                            console.log('[ModelPreview] Loaded textures:', Object.keys(sknData.textures));
                        } else {
                            console.log('[ModelPreview] No textures found in mesh data');
                        }
                    } else {
                        throw meshResult.reason;
                    }

                    if (cancelled) return;

                    // Handle animation result (optional)
                    if (animResult.status === 'fulfilled') {
                        const animList = animResult.value;
                        if (animList.clips && animList.clips.length > 0) {
                            console.log('[ModelPreview] Found animations:', animList.clips.length);
                            setAnimations(animList.clips);
                        }
                    } else {
                        console.log('[ModelPreview] No animations found:', animResult.reason);
                    }

                    // Handle skeleton result (optional)
                    if (sklResult.status === 'fulfilled') {
                        const skeleton = sklResult.value;
                        console.log('[ModelPreview] Loaded skeleton with', skeleton.bones.length, 'bones');
                        setSkeletonData(skeleton);
                    } else {
                        console.log('[ModelPreview] No skeleton found:', sklResult.reason);
                    }
                }

                if (cancelled) return;

                // Set mesh data and visible materials (for both static and skinned meshes)
                setMeshData(data);

                // Initialize all materials as visible
                if (isSknMeshData(data)) {
                    setVisibleMaterials(new Set(data.materials.map((m: MaterialRange) => m.name)));
                } else {
                    setVisibleMaterials(new Set(data.materials));
                }
            } catch (err) {
                if (cancelled) return;
                console.error('[ModelPreview] Failed to load mesh:', err);
                setError((err as Error).message || 'Failed to load mesh');
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        loadMesh();
        return () => { cancelled = true; };
    }, [filePath, meshType]);

    // Load animation when selection changes
    useEffect(() => {
        if (!selectedAnimation) {
            setAnimationData(null);
            setCurrentTime(0);
            setCurrentPose(null);
            return;
        }

        const loadAnimation = async () => {
            console.log('[ModelPreview] Loading animation:', selectedAnimation);
            try {
                const animData = await api.readAnimation(selectedAnimation, filePath);
                console.log('[ModelPreview] Loaded animation:', animData);
                setAnimationData(animData);
                setCurrentTime(0);
            } catch (err) {
                console.error('[ModelPreview] Failed to load animation:', err);
                setAnimationData(null);
            }
        };

        loadAnimation();
    }, [selectedAnimation, filePath]);

    // Animation playback loop
    useEffect(() => {
        if (!isPlaying || !animationData) {
            lastFrameTimeRef.current = 0;
            return;
        }

        const animate = (timestamp: number) => {
            if (!lastFrameTimeRef.current) lastFrameTimeRef.current = timestamp;

            const deltaTime = (timestamp - lastFrameTimeRef.current) / 1000;
            lastFrameTimeRef.current = timestamp;

            setCurrentTime(prev => {
                const newTime = prev + deltaTime;
                return newTime >= animationData.duration ? 0 : newTime;
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [isPlaying, animationData]);

    // Evaluate animation at current time
    useEffect(() => {
        if (!selectedAnimation || !animationData) return;

        const evaluatePose = async () => {
            try {
                const pose = await api.evaluateAnimation(
                    selectedAnimation,
                    filePath,
                    currentTime
                );
                setCurrentPose(pose);
                console.log('[ModelPreview] Pose at', currentTime.toFixed(3), 's:', Object.keys(pose.joints).length, 'joints');
            } catch (err) {
                console.error('[ModelPreview] Failed to evaluate pose:', err);
            }
        };

        evaluatePose();
    }, [selectedAnimation, currentTime, filePath, animationData]);

    // Toggle material visibility
    const toggleMaterial = (name: string) => {
        setVisibleMaterials(prev => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    };

    // Toggle all materials
    const toggleAllMaterials = (visible: boolean) => {
        if (visible && meshData) {
            if (isSknMeshData(meshData)) {
                setVisibleMaterials(new Set(meshData.materials.map(m => m.name)));
            } else {
                setVisibleMaterials(new Set(meshData.materials));
            }
        } else {
            setVisibleMaterials(new Set());
        }
    };

    if (loading) {
        return (
            <div className="model-preview model-preview--loading">
                <div className="spinner" />
                <span>Loading 3D model...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="model-preview model-preview--error">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
            </div>
        );
    }

    if (!meshData) {
        return (
            <div className="model-preview model-preview--empty">
                <span>No mesh data available</span>
            </div>
        );
    }

    return (
        <div className="model-preview">
            {/* 3D Canvas */}
            <div className="model-preview__canvas">
                <Canvas>
                    <PerspectiveCamera makeDefault fov={50} position={[0, 0, 5]} />
                    {/* Improved lighting setup for better model visibility */}
                    <ambientLight intensity={0.8} />
                    <directionalLight position={[10, 10, 10]} intensity={1.5} />
                    <directionalLight position={[-10, -10, -10]} intensity={0.6} />
                    <directionalLight position={[0, 10, 0]} intensity={0.4} />
                    {/* Floor grid at Y=0 - renders first so model is on top */}
                    <Grid
                        position={[0, 0, 0]}
                        args={[30, 30]}
                        cellSize={0.5}
                        cellThickness={0.5}
                        cellColor="#3a3a3a"
                        sectionSize={2}
                        sectionThickness={1}
                        sectionColor="#4a4a4a"
                        fadeDistance={25}
                        fadeStrength={1}
                        infiniteGrid={true}
                        renderOrder={-1}
                    />
                    <MeshViewer
                        meshData={meshData}
                        visibleMaterials={visibleMaterials}
                        wireframe={wireframe}
                        skeletonData={skeletonData}
                        animationPose={currentPose}
                    />
                    {showSkeleton && skeletonData && (
                        <SkeletonViewer skeletonData={skeletonData} animationPose={currentPose} />
                    )}
                    <OrbitControls />
                </Canvas>
            </div>

            {/* Sidebar with controls */}
            <div className="model-preview__sidebar">
                <div className="model-preview__controls">
                    <h4>Display</h4>
                    <label className="model-preview__toggle">
                        <input
                            type="checkbox"
                            checked={wireframe}
                            onChange={(e) => setWireframe(e.target.checked)}
                        />
                        <span>Wireframe</span>
                    </label>
                </div>

                <div className="model-preview__materials">
                    <div className="model-preview__materials-header">
                        <h4>Materials ({meshData.materials.length})</h4>
                        <div className="model-preview__materials-actions">
                            <button
                                className="btn btn--sm"
                                onClick={() => toggleAllMaterials(true)}
                                title="Show all"
                            >
                                All
                            </button>
                            <button
                                className="btn btn--sm"
                                onClick={() => toggleAllMaterials(false)}
                                title="Hide all"
                            >
                                None
                            </button>
                        </div>
                    </div>
                    <div className="model-preview__materials-list">
                        {meshData.materials.map((mat, index) => {
                            const matName = typeof mat === 'string' ? mat : mat.name;
                            // Check for texture in material_data (new) or textures (deprecated)
                            const hasTexture = isSknMeshData(meshData) && (
                                (meshData.material_data && meshData.material_data[matName]) ||
                                (meshData.textures && meshData.textures[matName])
                            );
                            return (
                                <label
                                    key={matName || index}
                                    className={`material-toggle ${hasTexture ? 'material-toggle--has-texture' : 'material-toggle--no-texture'}`}
                                    onMouseEnter={(e) => {
                                        setHoveredMaterial(matName);
                                        setPreviewPosition({ x: e.clientX, y: e.clientY });
                                    }}
                                    onMouseLeave={() => setHoveredMaterial(null)}
                                    onMouseMove={(e) => {
                                        setPreviewPosition({ x: e.clientX, y: e.clientY });
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={visibleMaterials.has(matName)}
                                        onChange={() => toggleMaterial(matName)}
                                    />
                                    <span
                                        className="material-toggle__color"
                                        style={{
                                            backgroundColor: hasTexture ? '#4ade80' : '#f87171'
                                        }}
                                    />
                                    <span className="material-toggle__name" title={matName}>
                                        {matName || `Material ${index}`}
                                    </span>
                                    <span className="material-toggle__status">
                                        {hasTexture ? '✓' : '✗'}
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    {/* Texture Preview Tooltip - uses shared asset-preview-tooltip styling */}
                    {hoveredMaterial && isSknMeshData(meshData) && (
                        <div
                            className="asset-preview-tooltip"
                            style={{
                                position: 'fixed',
                                left: previewPosition.x - 240,
                                top: previewPosition.y - 100,
                                zIndex: 9999,
                                pointerEvents: 'none'
                            }}
                        >
                            <div className="asset-preview-tooltip__header">
                                {hoveredMaterial}
                            </div>
                            <div className="asset-preview-tooltip__content">
                                {(() => {
                                    // Get texture from material_data (new) or textures (deprecated)
                                    const textureData = meshData.material_data?.[hoveredMaterial]?.texture ||
                                        meshData.textures?.[hoveredMaterial];
                                    if (textureData) {
                                        return (
                                            <div className="asset-preview-tooltip__texture">
                                                <img
                                                    src={`data:image/png;base64,${textureData}`}
                                                    alt={hoveredMaterial}
                                                    style={{
                                                        maxWidth: '180px',
                                                        maxHeight: '160px',
                                                        objectFit: 'contain',
                                                        borderRadius: '4px',
                                                        background: 'repeating-conic-gradient(var(--bg-tertiary) 0% 25%, var(--bg-primary) 0% 50%) 50% / 10px 10px'
                                                    }}
                                                />
                                            </div>
                                        );
                                    } else {
                                        return (
                                            <div className="asset-preview-tooltip__error">
                                                <span className="asset-preview-tooltip__error-icon">🎨</span>
                                                <span>No texture loaded</span>
                                            </div>
                                        );
                                    }
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Animation Controls */}
                {animations.length > 0 && (
                    <div className="model-preview__animations">
                        <h4>Animations ({animations.length})</h4>
                        <select
                            className="model-preview__animation-select"
                            value={selectedAnimation}
                            onChange={(e) => setSelectedAnimation(e.target.value)}
                        >
                            <option value="">-- Select Animation --</option>
                            {animations.map((anim, index) => (
                                <option key={index} value={anim.animation_path}>
                                    {anim.name}
                                </option>
                            ))}
                        </select>
                        {selectedAnimation && (
                            <div className="model-preview__playback-controls">
                                <button
                                    className={`btn btn--sm ${isPlaying ? 'btn--active' : ''}`}
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    title={isPlaying ? 'Pause' : 'Play'}
                                >
                                    {isPlaying ? '⏸️ Pause' : '▶️ Play'}
                                </button>
                                <button
                                    className="btn btn--sm"
                                    onClick={() => { setIsPlaying(false); setCurrentTime(0); }}
                                    title="Stop"
                                >
                                    ⏹️ Stop
                                </button>
                            </div>
                        )}
                        {animationData && (
                            <div className="model-preview__timeline">
                                <input
                                    type="range"
                                    min={0}
                                    max={animationData.duration}
                                    step={0.001}
                                    value={currentTime}
                                    onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                                    className="model-preview__timeline-slider"
                                />
                                <div className="model-preview__timeline-info">
                                    <span>{currentTime.toFixed(2)}s / {animationData.duration.toFixed(2)}s</span>
                                    <span className="model-preview__timeline-fps">
                                        {animationData.fps.toFixed(0)} FPS · {animationData.joint_count} joints
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Skeleton Controls */}
                {skeletonData && (
                    <div className="model-preview__skeleton">
                        <h4>Skeleton ({skeletonData.bones.length} bones)</h4>
                        <label className="model-preview__toggle">
                            <input
                                type="checkbox"
                                checked={showSkeleton}
                                onChange={(e) => setShowSkeleton(e.target.checked)}
                            />
                            <span>Show Skeleton</span>
                        </label>
                    </div>
                )}

                {/* Texture Debug Info */}
                {isSknMeshData(meshData) && meshData.textures && Object.keys(meshData.textures).length > 0 && (
                    <div className="model-preview__debug">
                        <small>Textures loaded: {Object.keys(meshData.textures).length}</small>
                    </div>
                )}
            </div>
        </div>
    );
};
