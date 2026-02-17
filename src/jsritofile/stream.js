/**
 * BytesStream - Binary stream reader for parsing binary files
 * Similar to Python's BytesStream
 */

export class BytesStream {
    constructor(buffer) {
        if (buffer === undefined || buffer === null) {
            // Writer mode - start with empty buffer
            this.buffer = Buffer.alloc(0);
            this.offset = 0;
            this.isWriter = true;
            this.sizeOffsets = []; // For tracking size offsets to fill in later
        } else {
            // Reader mode
            this.buffer = buffer;
            this.offset = 0;
            this.isWriter = false;
        }
        this.legacyRead = false;
    }

    /**
     * Create a BytesStream from a file path (Node.js) or Buffer
     * @param {Buffer|string} source - Buffer or file path
     * @returns {BytesStream}
     */
    static from(source) {
        if (Buffer.isBuffer(source)) {
            return new BytesStream(source);
        }
        // For browser, would need FileReader API
        throw new Error('BytesStream.from() requires a Buffer in Node.js');
    }

    /**
     * Create a BytesStream in writer mode
     * @returns {BytesStream}
     */
    static writer() {
        return new BytesStream();
    }

    tell() {
        return this.offset;
    }

    seek(pos, mode = 0) {
        if (mode === 0) {
            this.offset = pos;
        } else if (mode === 1) {
            this.offset += pos;
        } else if (mode === 2) {
            this.offset = this.buffer.length + pos;
        }
    }

    pad(length) {
        this.offset += length;
    }

    read(length) {
        const data = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return data;
    }

    readU8(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.buffer.readUInt8(this.offset));
            this.offset += 1;
        }
        return count === 1 ? values[0] : values;
    }

    readI8(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.buffer.readInt8(this.offset));
            this.offset += 1;
        }
        return count === 1 ? values[0] : values;
    }

    readU16(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.buffer.readUInt16LE(this.offset));
            this.offset += 2;
        }
        return count === 1 ? values[0] : values;
    }

    readI16(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.buffer.readInt16LE(this.offset));
            this.offset += 2;
        }
        return count === 1 ? values[0] : values;
    }

    readU32(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.buffer.readUInt32LE(this.offset));
            this.offset += 4;
        }
        return count === 1 ? values[0] : values;
    }

    readI32(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.buffer.readInt32LE(this.offset));
            this.offset += 4;
        }
        return count === 1 ? values[0] : values;
    }

    readU64(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            // Read as two U32s and combine
            const low = this.buffer.readUInt32LE(this.offset);
            const high = this.buffer.readUInt32LE(this.offset + 4);
            // JavaScript doesn't have native 64-bit ints, so we return as string or use BigInt
            const value = (BigInt(high) << 32n) | BigInt(low);
            values.push(value);
            this.offset += 8;
        }
        return count === 1 ? values[0] : values;
    }

    readF32(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.buffer.readFloatLE(this.offset));
            this.offset += 4;
        }
        return count === 1 ? values[0] : values;
    }

    readBool(count = 1) {
        const values = [];
        for (let i = 0; i < count; i++) {
            values.push(this.buffer.readUInt8(this.offset) !== 0);
            this.offset += 1;
        }
        return count === 1 ? values[0] : values;
    }

    readString(length, encoding = 'utf-8') {
        const data = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return data.toString(encoding);
    }

    readStringSized16(encoding = 'utf-8') {
        const length = this.readU16();
        return this.readString(length, encoding);
    }

    readStringSized32(encoding = 'utf-8') {
        const length = this.readU32();
        return this.readString(length, encoding);
    }

    readVec2() {
        return {
            x: this.readF32(),
            y: this.readF32()
        };
    }

    readVec3() {
        return {
            x: this.readF32(),
            y: this.readF32(),
            z: this.readF32()
        };
    }

    readVec4() {
        return {
            x: this.readF32(),
            y: this.readF32(),
            z: this.readF32(),
            w: this.readF32()
        };
    }

    readMtx4() {
        const m = [];
        for (let i = 0; i < 16; i++) {
            m.push(this.readF32());
        }
        return m;
    }

    // ========== WRITE METHODS ==========

    /**
     * Ensure buffer has enough space for writing
     * @private
     */
    _ensureCapacity(needed) {
        if (!this.isWriter) {
            throw new Error('Cannot write to reader stream');
        }
        const required = this.offset + needed;
        if (required > this.buffer.length) {
            const newSize = Math.max(required, this.buffer.length * 2 || 1024);
            const newBuffer = Buffer.alloc(newSize);
            this.buffer.copy(newBuffer);
            this.buffer = newBuffer;
        }
    }

    write(data) {
        if (Buffer.isBuffer(data)) {
            this._ensureCapacity(data.length);
            data.copy(this.buffer, this.offset);
            this.offset += data.length;
        } else if (typeof data === 'string') {
            const buf = Buffer.from(data, 'utf-8');
            this._ensureCapacity(buf.length);
            buf.copy(this.buffer, this.offset);
            this.offset += buf.length;
        }
    }

    writeBool(...values) {
        for (const value of values) {
            this._ensureCapacity(1);
            this.buffer.writeUInt8(value ? 1 : 0, this.offset);
            this.offset += 1;
        }
    }

    writeI8(...values) {
        for (const value of values) {
            this._ensureCapacity(1);
            this.buffer.writeInt8(value, this.offset);
            this.offset += 1;
        }
    }

    writeU8(...values) {
        for (const value of values) {
            this._ensureCapacity(1);
            this.buffer.writeUInt8(value, this.offset);
            this.offset += 1;
        }
    }

    writeI16(...values) {
        for (const value of values) {
            this._ensureCapacity(2);
            this.buffer.writeInt16LE(value, this.offset);
            this.offset += 2;
        }
    }

    writeU16(...values) {
        for (const value of values) {
            this._ensureCapacity(2);
            this.buffer.writeUInt16LE(value, this.offset);
            this.offset += 2;
        }
    }

    writeI32(...values) {
        for (const value of values) {
            this._ensureCapacity(4);
            this.buffer.writeInt32LE(value, this.offset);
            this.offset += 4;
        }
    }

    writeU32(...values) {
        for (const value of values) {
            this._ensureCapacity(4);
            this.buffer.writeUInt32LE(value, this.offset);
            this.offset += 4;
        }
    }

    writeI64(...values) {
        for (const value of values) {
            this._ensureCapacity(8);
            const bigValue = BigInt(value);
            const low = Number(bigValue & 0xFFFFFFFFn);
            const high = Number((bigValue >> 32n) & 0xFFFFFFFFn);
            this.buffer.writeUInt32LE(low, this.offset);
            this.buffer.writeUInt32LE(high, this.offset + 4);
            this.offset += 8;
        }
    }

    writeU64(...values) {
        for (const value of values) {
            this._ensureCapacity(8);
            const bigValue = BigInt(value);
            const low = Number(bigValue & 0xFFFFFFFFn);
            const high = Number((bigValue >> 32n) & 0xFFFFFFFFn);
            this.buffer.writeUInt32LE(low, this.offset);
            this.buffer.writeUInt32LE(high, this.offset + 4);
            this.offset += 8;
        }
    }

    writeF32(...values) {
        for (const value of values) {
            this._ensureCapacity(4);
            this.buffer.writeFloatLE(value, this.offset);
            this.offset += 4;
        }
    }

    writeVec2(...values) {
        for (const vec of values) {
            this.writeF32(vec.x, vec.y);
        }
    }

    writeVec3(...values) {
        for (const vec of values) {
            this.writeF32(vec.x, vec.y, vec.z);
        }
    }

    writeVec4(...values) {
        for (const vec of values) {
            this.writeF32(vec.x, vec.y, vec.z, vec.w);
        }
    }

    writeMtx4(mtx4) {
        for (const f of mtx4) {
            this.writeF32(f);
        }
    }

    writeString(value, encoding = 'utf-8') {
        const buf = Buffer.from(value, encoding);
        this._ensureCapacity(buf.length);
        buf.copy(this.buffer, this.offset);
        this.offset += buf.length;
    }

    writeStringPadded(value, length, encoding = 'utf-8') {
        const buf = Buffer.from(value, encoding);
        const padded = Buffer.alloc(length);
        buf.copy(padded, 0, 0, Math.min(buf.length, length));
        this._ensureCapacity(length);
        padded.copy(this.buffer, this.offset);
        this.offset += length;
    }

    writeStringSized16(value, encoding = 'utf-8') {
        const buf = Buffer.from(value, encoding);
        this.writeU16(buf.length);
        this._ensureCapacity(buf.length);
        buf.copy(this.buffer, this.offset);
        this.offset += buf.length;
    }

    writeStringSized32(value, encoding = 'utf-8') {
        const buf = Buffer.from(value, encoding);
        this.writeU32(buf.length);
        this._ensureCapacity(buf.length);
        buf.copy(this.buffer, this.offset);
        this.offset += buf.length;
    }

    /**
     * Get the final buffer (trimmed to actual size)
     * @returns {Buffer}
     */
    raw() {
        if (!this.isWriter) {
            throw new Error('raw() only available for writer streams');
        }
        return this.buffer.slice(0, this.offset);
    }
}

