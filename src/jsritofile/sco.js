/**
 * SCO (Static Object) - Text format parser/writer
 * Based on pyRitoFile so.py
 */

let _fs = null;
function getFs() {
    if (_fs) return _fs;
    if (typeof window !== 'undefined' && window.require) _fs = window.require('fs');
    else _fs = require('fs');
    return _fs;
}

function formatG(value) {
    // Mimic Python's .4g format
    const s = Number(value).toPrecision(4);
    // Remove trailing zeros after decimal point, and trailing dot
    return parseFloat(s).toString();
}

export class SCO {
    constructor() {
        this.name = '';
        this.central = { x: 0, y: 0, z: 0 };
        this.pivot = null; // { x, y, z } or null
        this.positions = [];  // [{ x, y, z }]
        this.indices = [];    // flat [int] — 3 per face
        this.uvs = [];        // [{ x, y }] — 3 per face, parallel to indices
        this.material = '';
    }

    read(path) {
        const buffer = getFs().readFileSync(path);
        return this.readBuffer(buffer);
    }

    readBuffer(buffer) {
        const text = (Buffer.isBuffer(buffer) ? buffer.toString('utf-8') : String(buffer));
        const rawLines = text.split(/\r?\n/);
        const lines = rawLines.filter(l => l.trim().length > 0);

        let i = 0;

        // [ObjectBegin]
        if (lines[i].trim() !== '[ObjectBegin]') {
            throw new Error('Invalid SCO: missing [ObjectBegin]');
        }
        i++;

        while (i < lines.length) {
            const line = lines[i].trim();
            if (line === '[ObjectEnd]') break;

            if (line.startsWith('Name=')) {
                this.name = line.substring(5).trim();
                i++;
            } else if (line.startsWith('CentralPoint=')) {
                const parts = line.substring(13).trim().split(/\s+/).map(Number);
                this.central = { x: parts[0], y: parts[1], z: parts[2] };
                i++;
            } else if (line.startsWith('PivotPoint=')) {
                const parts = line.substring(11).trim().split(/\s+/).map(Number);
                this.pivot = { x: parts[0], y: parts[1], z: parts[2] };
                i++;
            } else if (line.startsWith('Verts=')) {
                const count = parseInt(line.substring(6).trim(), 10);
                i++;
                this.positions = [];
                for (let v = 0; v < count; v++) {
                    const parts = lines[i].trim().split(/\s+/).map(Number);
                    this.positions.push({ x: parts[0], y: parts[1], z: parts[2] });
                    i++;
                }
            } else if (line.startsWith('Faces=')) {
                const count = parseInt(line.substring(6).trim(), 10);
                i++;
                this.indices = [];
                this.uvs = [];
                for (let f = 0; f < count; f++) {
                    const faceLine = lines[i].replace(/\t/g, ' ').trim();
                    const parts = faceLine.split(/\s+/);
                    // parts: [0]="3", [1]=i0, [2]=i1, [3]=i2, [4]=material, [5]=u0, [6]=v0, [7]=u1, [8]=v1, [9]=u2, [10]=v2
                    const i0 = parseInt(parts[1], 10);
                    const i1 = parseInt(parts[2], 10);
                    const i2 = parseInt(parts[3], 10);
                    const mat = parts[4];

                    i++;

                    // Skip degenerate faces
                    if (i0 === i1 || i1 === i2 || i0 === i2) continue;

                    this.indices.push(i0, i1, i2);
                    this.material = mat;
                    this.uvs.push(
                        { x: parseFloat(parts[5]), y: parseFloat(parts[6]) },
                        { x: parseFloat(parts[7]), y: parseFloat(parts[8]) },
                        { x: parseFloat(parts[9]), y: parseFloat(parts[10]) }
                    );
                }
            } else {
                i++;
            }
        }

        return this;
    }

    write(path) {
        const buffer = this.writeBuffer();
        getFs().writeFileSync(path, buffer);
        return buffer;
    }

    writeBuffer() {
        const lines = [];
        lines.push('[ObjectBegin]');
        lines.push(`Name= ${this.name}`);
        lines.push(`CentralPoint= ${formatG(this.central.x)} ${formatG(this.central.y)} ${formatG(this.central.z)}`);

        if (this.pivot) {
            lines.push(`PivotPoint= ${formatG(this.pivot.x)} ${formatG(this.pivot.y)} ${formatG(this.pivot.z)}`);
        }

        lines.push(`Verts= ${this.positions.length}`);
        for (const p of this.positions) {
            lines.push(`${formatG(p.x)} ${formatG(p.y)} ${formatG(p.z)}`);
        }

        const faceCount = this.indices.length / 3;
        lines.push(`Faces= ${faceCount}`);
        for (let f = 0; f < faceCount; f++) {
            const base = f * 3;
            const i0 = this.indices[base];
            const i1 = this.indices[base + 1];
            const i2 = this.indices[base + 2];
            const uv0 = this.uvs[base];
            const uv1 = this.uvs[base + 1];
            const uv2 = this.uvs[base + 2];
            const mat = (this.material || '').padStart(20);
            lines.push(
                `3\t ${String(i0).padStart(5)} ${String(i1).padStart(5)} ${String(i2).padStart(5)}\t${mat}\t` +
                `${uv0.x.toFixed(12)} ${uv0.y.toFixed(12)} ${uv1.x.toFixed(12)} ${uv1.y.toFixed(12)} ${uv2.x.toFixed(12)} ${uv2.y.toFixed(12)}`
            );
        }

        lines.push('[ObjectEnd]');
        return Buffer.from(lines.join('\n'), 'utf-8');
    }
}

export default SCO;
