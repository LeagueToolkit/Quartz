/**
 * SKL (Skeleton) - JavaScript implementation
 * Based on pyRitoFile skl.py
 */

import { BytesStream } from './stream.js';
import { FNV1a, hashToHex } from './helper.js';

const fs = window.require('fs');

export class SKLJoint {
    constructor() {
        this.id = 0;
        this.name = '';
        this.binHash = '00000000';
        this.parent = -1;
        this.hash = 0;
        this.radius = 0;
        this.flags = 0;
        this.localTranslate = { x: 0, y: 0, z: 0 };
        this.localRotate = { x: 0, y: 0, z: 0, w: 1 };
        this.localScale = { x: 1, y: 1, z: 1 };
        this.ibindTranslate = { x: 0, y: 0, z: 0 };
        this.ibindRotate = { x: 0, y: 0, z: 0, w: 1 };
        this.ibindScale = { x: 1, y: 1, z: 1 };
    }
}

export class SKL {
    constructor() {
        this.fileSize = 0;
        this.signature = null;
        this.version = 0;
        this.flags = 0;
        this.name = null;
        this.asset = null;
        this.joints = [];
        this.influences = [];
    }

    /**
     * Read SKL from file path
     * @param {string} path - File path
     */
    read(path) {
        const buffer = fs.readFileSync(path);
        return this.readBuffer(buffer);
    }

    /**
     * Read SKL from buffer
     * @param {Buffer} buffer - SKL binary data
     */
    readBuffer(buffer) {
        const bs = new BytesStream(buffer);

        // Read signature first to check if new or legacy format
        bs.pad(4);
        const signatureCheck = bs.readU32();
        bs.seek(0);

        if (signatureCheck === 0x22FD4FC3) {
            // New SKL format
            this.fileSize = bs.readU32();
            const sig = bs.readU32();
            this.signature = `0x${sig.toString(16)}`;
            this.version = bs.readU32();

            if (this.version !== 0) {
                throw new Error(`Unsupported SKL version: ${this.version}`);
            }

            this.flags = bs.readU16();
            const jointCount = bs.readU16();
            const influenceCount = bs.readU32();

            // Offsets
            const jointsOffset = bs.readI32();
            bs.readI32(); // joint indices offset
            const influencesOffset = bs.readI32();
            const nameOffset = bs.readI32();
            const assetOffset = bs.readI32();
            bs.readI32(); // joint names offset

            // Skip padding
            bs.pad(20);

            // Read joints
            if (jointsOffset > 0 && jointCount > 0) {
                bs.seek(jointsOffset);
                this.joints = [];

                for (let i = 0; i < jointCount; i++) {
                    const joint = new SKLJoint();
                    joint.flags = bs.readU16();
                    joint.id = bs.readI16();
                    joint.parent = bs.readI16();
                    bs.pad(2);  // padding
                    joint.hash = bs.readU32();
                    joint.radius = bs.readF32();

                    joint.localTranslate = bs.readVec3();
                    joint.localScale = bs.readVec3();
                    joint.localRotate = bs.readVec4();  // quaternion

                    joint.ibindTranslate = bs.readVec3();
                    joint.ibindScale = bs.readVec3();
                    joint.ibindRotate = bs.readVec4();  // quaternion

                    // Read name offset and name
                    const jointNameOffset = bs.readI32();
                    const returnOffset = bs.tell();
                    bs.seek(returnOffset - 4 + jointNameOffset);

                    // Read null-terminated string
                    const nameBytes = [];
                    while (true) {
                        const byte = bs.readU8();
                        if (byte === 0) break;
                        nameBytes.push(byte);
                    }
                    joint.name = Buffer.from(nameBytes).toString('utf-8');
                    joint.binHash = hashToHex(FNV1a(joint.name));

                    bs.seek(returnOffset);
                    this.joints.push(joint);
                }
            }

            // Read influences
            if (influencesOffset > 0 && influenceCount > 0) {
                bs.seek(influencesOffset);
                this.influences = [];
                for (let i = 0; i < influenceCount; i++) {
                    this.influences.push(bs.readU16());
                }
            }

            // Read name and asset strings (optional)
            if (nameOffset > 0) {
                bs.seek(nameOffset);
                const nameBytes = [];
                while (true) {
                    const byte = bs.readU8();
                    if (byte === 0) break;
                    nameBytes.push(byte);
                }
                this.name = Buffer.from(nameBytes).toString('utf-8');
            }

            if (assetOffset > 0) {
                bs.seek(assetOffset);
                const assetBytes = [];
                while (true) {
                    const byte = bs.readU8();
                    if (byte === 0) break;
                    assetBytes.push(byte);
                }
                this.asset = Buffer.from(assetBytes).toString('utf-8');
            }
        } else {
            // Legacy format - not implemented yet
            throw new Error('Legacy SKL format not yet supported in JavaScript version');
        }

        return this;
    }

    /**
     * Get the root bone (parent === -1)
     * @returns {SKLJoint|null}
     */
    getRootBone() {
        return this.joints.find(j => j.parent === -1) || null;
    }

    /**
     * Find bone by name
     * @param {string} name - Bone name
     * @returns {SKLJoint|null}
     */
    findBoneByName(name) {
        return this.joints.find(j => j.name.toLowerCase() === name.toLowerCase()) || null;
    }
}

export default SKL;
