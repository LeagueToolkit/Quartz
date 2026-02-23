/**
 * SCB (Static Object Binary) - Binary format parser/writer
 * Based on pyRitoFile so.py
 */

import { BytesStream } from './stream.js';

let _fs = null;
function getFs() {
    if (_fs) return _fs;
    if (typeof window !== 'undefined' && window.require) _fs = window.require('fs');
    else _fs = require('fs');
    return _fs;
}

export const SOFlag = {
    HasVcp: 1,
    HasLocalOriginLocatorAndPivot: 2,
};

export class SCB {
    constructor() {
        this.signature = 'r3d2Mesh';
        this.version = 3.2;
        this.flags = 0;
        this.name = '';
        this.central = { x: 0, y: 0, z: 0 };
        this.boundingBox = {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 0, y: 0, z: 0 },
        };
        this.material = '';
        this.vertexType = 0;
        this.positions = [];  // [{ x, y, z }]
        this.indices = [];    // flat [int] — 3 per face
        this.uvs = [];        // [{ x, y }] — 3 per face, parallel to indices
        this.colors = [];     // [{ r, g, b, a }] — per vertex, only when vertexType >= 1
    }

    read(path) {
        const buffer = getFs().readFileSync(path);
        return this.readBuffer(buffer);
    }

    readBuffer(buffer) {
        const bs = new BytesStream(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));

        // Magic: 8 ASCII bytes
        this.signature = bs.readString(8, 'ascii');
        if (this.signature !== 'r3d2Mesh') {
            throw new Error(`Invalid SCB signature: "${this.signature}"`);
        }

        // Version
        const major = bs.readU16();
        const minor = bs.readU16();
        this.version = parseFloat(`${major}.${minor}`);

        if (major !== 3 && major !== 2 && minor !== 1) {
            throw new Error(`Unsupported SCB version: ${major}.${minor}`);
        }

        // Name: 128 bytes null-padded
        const nameRaw = bs.readString(128, 'ascii');
        this.name = nameRaw.replace(/\0/g, '');

        // Counts and flags
        const vertexCount = bs.readU32();
        const faceCount = bs.readU32();
        this.flags = bs.readU32();

        // Bounding box
        this.boundingBox = {
            min: bs.readVec3(),
            max: bs.readVec3(),
        };

        // Vertex type (version 3.2 only)
        if (major === 3 && minor === 2) {
            this.vertexType = bs.readU32();
        } else {
            this.vertexType = 0;
        }

        // Positions
        this.positions = [];
        for (let i = 0; i < vertexCount; i++) {
            this.positions.push(bs.readVec3());
        }

        // Vertex colors (only when vertexType >= 1)
        this.colors = [];
        if (this.vertexType >= 1) {
            for (let i = 0; i < vertexCount; i++) {
                const r = bs.readU8();
                const g = bs.readU8();
                const b = bs.readU8();
                const a = bs.readU8();
                this.colors.push({ r, g, b, a });
            }
        }

        // Central point (comes after positions)
        this.central = bs.readVec3();

        // Faces
        this.indices = [];
        this.uvs = [];
        this.material = '';
        for (let f = 0; f < faceCount; f++) {
            const i0 = bs.readU32();
            const i1 = bs.readU32();
            const i2 = bs.readU32();

            // Material: 64 bytes null-padded
            const matRaw = bs.readString(64, 'ascii');
            const mat = matRaw.replace(/\0/g, '');

            // UVs: stored as u0 u1 u2 v0 v1 v2 (de-interleave)
            const u0 = bs.readF32();
            const u1 = bs.readF32();
            const u2 = bs.readF32();
            const v0 = bs.readF32();
            const v1 = bs.readF32();
            const v2 = bs.readF32();

            // Skip degenerate faces
            if (i0 === i1 || i1 === i2 || i0 === i2) continue;

            this.indices.push(i0, i1, i2);
            this.material = mat;
            this.uvs.push(
                { x: u0, y: v0 },
                { x: u1, y: v1 },
                { x: u2, y: v2 }
            );
        }

        return this;
    }

    write(path) {
        const buffer = this.writeBuffer();
        getFs().writeFileSync(path, buffer);
        return buffer;
    }

    writeBuffer() {
        const bs = BytesStream.writer();

        // Magic
        bs.writeString('r3d2Mesh', 'ascii');

        // Version: always write 3.2
        bs.writeU16(3);
        bs.writeU16(2);

        // Name: 128 bytes null-padded (write empty like Python does)
        bs.writeStringPadded('', 128, 'ascii');

        // Counts
        bs.writeU32(this.positions.length);
        const faceCount = this.indices.length / 3;
        bs.writeU32(faceCount);
        bs.writeU32(this.flags);

        // Bounding box (recompute from positions)
        const bb = this._computeBoundingBox();
        bs.writeVec3(bb.min);
        bs.writeVec3(bb.max);

        // Vertex type: always 0
        bs.writeU32(0);

        // Positions
        for (const p of this.positions) {
            bs.writeVec3(p);
        }

        // Central
        bs.writeVec3(this.central);

        // Faces
        for (let f = 0; f < faceCount; f++) {
            const base = f * 3;
            bs.writeU32(this.indices[base]);
            bs.writeU32(this.indices[base + 1]);
            bs.writeU32(this.indices[base + 2]);

            // Material: 64 bytes null-padded
            bs.writeStringPadded(this.material || '', 64, 'ascii');

            // UVs: interleave as u0 u1 u2 v0 v1 v2
            const uv0 = this.uvs[base];
            const uv1 = this.uvs[base + 1];
            const uv2 = this.uvs[base + 2];
            bs.writeF32(uv0.x, uv1.x, uv2.x, uv0.y, uv1.y, uv2.y);
        }

        return bs.raw();
    }

    _computeBoundingBox() {
        if (this.positions.length === 0) {
            return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
        }
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const p of this.positions) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.z < minZ) minZ = p.z;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
            if (p.z > maxZ) maxZ = p.z;
        }
        return {
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ },
        };
    }
}

export default SCB;
