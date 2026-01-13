/**
 * SKN (Skin Mesh) - JavaScript implementation
 * Based on pyRitoFile skn.py
 */

import { BytesStream } from './stream.js';
import { FNV1a, hashToHex } from './helper.js';

const fs = window.require('fs');

export const SKNVertexType = {
    BASIC: 0,
    COLOR: 1,
    TANGENT: 2
};

export class SKNVertex {
    constructor() {
        this.position = { x: 0, y: 0, z: 0 };
        this.influences = [0, 0, 0, 0];
        this.weights = [0, 0, 0, 0];
        this.normal = { x: 0, y: 1, z: 0 };
        this.uv = { x: 0, y: 0 };
        this.color = null;  // [r, g, b, a] - only for COLOR/TANGENT types
        this.tangent = null;  // {x, y, z, w} - only for TANGENT type
    }
}

export class SKNSubmesh {
    constructor() {
        this.name = '';
        this.binHash = '00000000';
        this.vertexStart = 0;
        this.vertexCount = 0;
        this.indexStart = 0;
        this.indexCount = 0;
    }
}

export class SKN {
    constructor() {
        this.signature = '0x00112233';
        this.version = 4.1;
        this.flags = 0;
        this.boundingBox = null;  // [{x, y, z}, {x, y, z}]
        this.boundingSphere = null;  // [{x, y, z}, radius]
        this.vertexType = SKNVertexType.BASIC;
        this.vertexSize = 52;
        this.submeshes = [];
        this.indices = [];
        this.vertices = [];
    }

    /**
     * Read SKN from file path
     * @param {string} path - File path
     */
    read(path) {
        const buffer = fs.readFileSync(path);
        return this.readBuffer(buffer);
    }

    /**
     * Read SKN from buffer
     * @param {Buffer} buffer - SKN binary data
     */
    readBuffer(buffer) {
        const bs = new BytesStream(buffer);

        // Read header
        const signature = bs.readU32();
        if (signature !== 0x00112233) {
            throw new Error(`Invalid SKN signature: ${signature.toString(16)}`);
        }
        this.signature = `0x${signature.toString(16)}`;

        const major = bs.readU16();
        const minor = bs.readU16();
        this.version = parseFloat(`${major}.${minor}`);

        if (major === 0) {
            // Version 0 - no submesh data
            const indexCount = bs.readU32();
            const vertexCount = bs.readU32();

            const submesh = new SKNSubmesh();
            submesh.name = 'Base';
            submesh.binHash = hashToHex(FNV1a(submesh.name));
            submesh.vertexStart = 0;
            submesh.vertexCount = vertexCount;
            submesh.indexStart = 0;
            submesh.indexCount = indexCount;
            this.submeshes = [submesh];
        } else {
            // Version 1+ - has submesh data
            const submeshCount = bs.readU32();
            this.submeshes = [];

            for (let i = 0; i < submeshCount; i++) {
                const submesh = new SKNSubmesh();
                const nameBytes = bs.read(64);
                submesh.name = nameBytes.toString('utf-8').replace(/\0/g, '');
                submesh.binHash = hashToHex(FNV1a(submesh.name));
                submesh.vertexStart = bs.readU32();
                submesh.vertexCount = bs.readU32();
                submesh.indexStart = bs.readU32();
                submesh.indexCount = bs.readU32();
                this.submeshes.push(submesh);
            }

            if (major >= 4) {
                this.flags = bs.readU32();
            }

            const indexCount = bs.readU32();
            const vertexCount = bs.readU32();

            if (major >= 4) {
                this.vertexSize = bs.readU32();
                this.vertexType = bs.readU32();

                const bbMin = bs.readVec3();
                const bbMax = bs.readVec3();
                this.boundingBox = [bbMin, bbMax];

                const bsCenter = bs.readVec3();
                const bsRadius = bs.readF32();
                this.boundingSphere = [bsCenter, bsRadius];
            }

            // Read indices
            this.indices = [];
            for (let i = 0; i < indexCount; i += 3) {
                const i0 = bs.readU16();
                const i1 = bs.readU16();
                const i2 = bs.readU16();
                // Skip degenerate triangles
                if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
                    this.indices.push(i0, i1, i2);
                }
            }

            // Read vertices
            this.vertices = [];
            for (let i = 0; i < vertexCount; i++) {
                const v = new SKNVertex();
                v.position = bs.readVec3();
                v.influences = [bs.readU8(), bs.readU8(), bs.readU8(), bs.readU8()];
                v.weights = [bs.readF32(), bs.readF32(), bs.readF32(), bs.readF32()];
                v.normal = bs.readVec3();
                v.uv = bs.readVec2();

                if (this.vertexType === SKNVertexType.COLOR || this.vertexType === SKNVertexType.TANGENT) {
                    v.color = [bs.readU8(), bs.readU8(), bs.readU8(), bs.readU8()];
                }
                if (this.vertexType === SKNVertexType.TANGENT) {
                    v.tangent = bs.readVec4();
                }

                this.vertices.push(v);
            }
        }

        return this;
    }

    /**
     * Write SKN to file
     * @param {string} path - Output file path
     */
    write(path) {
        const buffer = this.writeBuffer();
        fs.writeFileSync(path, buffer);
        return buffer;
    }

    /**
     * Write SKN to buffer
     * Hardcoded to output Version 1.1 (Standard, Safe) like lol_maya
     * @returns {Buffer}
     */
    writeBuffer() {
        const bs = BytesStream.writer();

        // Magic + version (Force 1.1)
        bs.writeU32(0x00112233);
        bs.writeU16(1, 1);

        // Submeshes
        bs.writeU32(this.submeshes.length);
        for (const submesh of this.submeshes) {
            bs.writeStringPadded(submesh.name, 64);
            bs.writeU32(submesh.vertexStart, submesh.vertexCount, submesh.indexStart, submesh.indexCount);
        }

        // Version 1 does NOT use flags here

        // Counts
        bs.writeU32(this.indices.length, this.vertices.length);

        // Version 1 does NOT use Header V2 (VertexSize, Type, Bounds)

        // Indices
        for (const idx of this.indices) {
            bs.writeU16(idx);
        }

        // Vertices (Always Type 0: Pos, Infl, Wgt, Nrm, UV)
        for (const v of this.vertices) {
            bs.writeVec3(v.position);
            bs.writeU8(...v.influences);
            bs.writeF32(...v.weights);

            // Normalize normal if needed, but usually just write
            bs.writeVec3(v.normal);
            bs.writeVec2(v.uv);

            // Version 1 does NOT support Color or Tangent data
            // We strip it to ensure compatibility
        }

        return bs.raw();
    }

    /**
     * Add a minimal invisible submesh bound to a specific bone
     * @param {string} submeshName - Name for the new submesh
     * @param {number} boneId - Bone ID to bind to (usually 0 for Root)
     * @param {number} scale - Scale of the mesh (default 0.001 for invisible)
     */
    addMinimalSubmesh(submeshName = 'MinimalMesh', boneId = 0, scale = 0.001) {
        // Create 3 vertices forming a tiny triangle
        const baseVertexIndex = this.vertices.length;
        const positions = [
            { x: 0, y: 0, z: 0 },
            { x: scale, y: 0, z: 0 },
            { x: 0, y: scale, z: 0 }
        ];

        for (const pos of positions) {
            const v = new SKNVertex();
            v.position = pos;
            v.influences = [boneId, 0, 0, 0];
            v.weights = [1.0, 0.0, 0.0, 0.0];
            v.normal = { x: 0, y: 1, z: 0 };
            v.uv = { x: 0, y: 0 };

            // Match vertex type
            if (this.vertexType === SKNVertexType.COLOR || this.vertexType === SKNVertexType.TANGENT) {
                v.color = [0, 0, 0, 0];  // Fully transparent
            }
            if (this.vertexType === SKNVertexType.TANGENT) {
                v.tangent = { x: 1, y: 0, z: 0, w: 1 };
            }

            this.vertices.push(v);
        }

        // Add indices
        const baseIndexIndex = this.indices.length;
        this.indices.push(baseVertexIndex, baseVertexIndex + 1, baseVertexIndex + 2);

        // Create submesh
        const submesh = new SKNSubmesh();
        submesh.name = submeshName;
        submesh.binHash = hashToHex(FNV1a(submeshName));
        submesh.vertexStart = baseVertexIndex;
        submesh.vertexCount = 3;
        submesh.indexStart = baseIndexIndex;
        submesh.indexCount = 3;

        this.submeshes.push(submesh);

        // Update bounding box/sphere if needed
        if (!this.boundingBox) {
            this.boundingBox = [
                { x: 0, y: 0, z: 0 },
                { x: scale, y: scale, z: scale }
            ];
        } else {
            // Expand existing bounding box
            const min = this.boundingBox[0];
            const max = this.boundingBox[1];

            // New mesh is at (0,0,0) to (scale,scale,scale)
            min.x = Math.min(min.x, 0);
            min.y = Math.min(min.y, 0);
            min.z = Math.min(min.z, 0);

            max.x = Math.max(max.x, scale);
            max.y = Math.max(max.y, scale);
            max.z = Math.max(max.z, scale);
        }

        if (!this.boundingSphere) {
            this.boundingSphere = [
                { x: scale / 2, y: scale / 2, z: scale / 2 },
                scale
            ];
        } else {
            // Re-calculate sphere is hard, just ensure it covers origin
            // Check distance from center to origin
            const center = this.boundingSphere[0];
            const radius = this.boundingSphere[1];

            const distToOrigin = Math.sqrt(center.x * center.x + center.y * center.y + center.z * center.z);
            const requiredRadius = distToOrigin + scale; // Conservative

            if (requiredRadius > radius) {
                this.boundingSphere[1] = requiredRadius;
            }
        }

        return submesh;
    }
}

export default SKN;
