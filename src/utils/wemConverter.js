/**
 * WEM to OGG/WAV Converter - JavaScript port of ww2ogg
 * Converts Wwise WEM audio files to standard OGG Vorbis or WAV format
 */

// CRC lookup table for OGG page checksums
const CRC_LOOKUP = new Uint32Array([
    0x00000000, 0x04c11db7, 0x09823b6e, 0x0d4326d9,
    0x130476dc, 0x17c56b6b, 0x1a864db2, 0x1e475005,
    0x2608edb8, 0x22c9f00f, 0x2f8ad6d6, 0x2b4bcb61,
    0x350c9b64, 0x31cd86d3, 0x3c8ea00a, 0x384fbdbd,
    0x4c11db70, 0x48d0c6c7, 0x4593e01e, 0x4152fda9,
    0x5f15adac, 0x5bd4b01b, 0x569796c2, 0x52568b75,
    0x6a1936c8, 0x6ed82b7f, 0x639b0da6, 0x675a1011,
    0x791d4014, 0x7ddc5da3, 0x709f7b7a, 0x745e66cd,
    0x9823b6e0, 0x9ce2ab57, 0x91a18d8e, 0x95609039,
    0x8b27c03c, 0x8fe6dd8b, 0x82a5fb52, 0x8664e6e5,
    0xbe2b5b58, 0xbaea46ef, 0xb7a96036, 0xb3687d81,
    0xad2f2d84, 0xa9ee3033, 0xa4ad16ea, 0xa06c0b5d,
    0xd4326d90, 0xd0f37027, 0xddb056fe, 0xd9714b49,
    0xc7361b4c, 0xc3f706fb, 0xceb42022, 0xca753d95,
    0xf23a8028, 0xf6fb9d9f, 0xfbb8bb46, 0xff79a6f1,
    0xe13ef6f4, 0xe5ffeb43, 0xe8bccd9a, 0xec7dd02d,
    0x34867077, 0x30476dc0, 0x3d044b19, 0x39c556ae,
    0x278206ab, 0x23431b1c, 0x2e003dc5, 0x2ac12072,
    0x128e9dcf, 0x164f8078, 0x1b0ca6a1, 0x1fcdbb16,
    0x018aeb13, 0x054bf6a4, 0x0808d07d, 0x0cc9cdca,
    0x7897ab07, 0x7c56b6b0, 0x71159069, 0x75d48dde,
    0x6b93dddb, 0x6f52c06c, 0x6211e6b5, 0x66d0fb02,
    0x5e9f46bf, 0x5a5e5b08, 0x571d7dd1, 0x53dc6066,
    0x4d9b3063, 0x495a2dd4, 0x44190b0d, 0x40d816ba,
    0xaca5c697, 0xa864db20, 0xa527fdf9, 0xa1e6e04e,
    0xbfa1b04b, 0xbb60adfc, 0xb6238b25, 0xb2e29692,
    0x8aad2b2f, 0x8e6c3698, 0x832f1041, 0x87ee0df6,
    0x99a95df3, 0x9d684044, 0x902b669d, 0x94ea7b2a,
    0xe0b41de7, 0xe4750050, 0xe9362689, 0xedf73b3e,
    0xf3b06b3b, 0xf771768c, 0xfa325055, 0xfef34de2,
    0xc6bcf05f, 0xc27dede8, 0xcf3ecb31, 0xcbffd686,
    0xd5b88683, 0xd1799b34, 0xdc3abded, 0xd8fba05a,
    0x690ce0ee, 0x6dcdfd59, 0x608edb80, 0x644fc637,
    0x7a089632, 0x7ec98b85, 0x738aad5c, 0x774bb0eb,
    0x4f040d56, 0x4bc510e1, 0x46863638, 0x42472b8f,
    0x5c007b8a, 0x58c1663d, 0x558240e4, 0x51435d53,
    0x251d3b9e, 0x21dc2629, 0x2c9f00f0, 0x285e1d47,
    0x36194d42, 0x32d850f5, 0x3f9b762c, 0x3b5a6b9b,
    0x0315d626, 0x07d4cb91, 0x0a97ed48, 0x0e56f0ff,
    0x1011a0fa, 0x14d0bd4d, 0x19939b94, 0x1d528623,
    0xf12f560e, 0xf5ee4bb9, 0xf8ad6d60, 0xfc6c70d7,
    0xe22b20d2, 0xe6ea3d65, 0xeba91bbc, 0xef68060b,
    0xd727bbb6, 0xd3e6a601, 0xdea580d8, 0xda649d6f,
    0xc423cd6a, 0xc0e2d0dd, 0xcda1f604, 0xc960ebb3,
    0xbd3e8d7e, 0xb9ff90c9, 0xb4bcb610, 0xb07daba7,
    0xae3afba2, 0xaafbe615, 0xa7b8c0cc, 0xa379dd7b,
    0x9b3660c6, 0x9ff77d71, 0x92b45ba8, 0x9675461f,
    0x8832161a, 0x8cf30bad, 0x81b02d74, 0x857130c3,
    0x5d8a9099, 0x594b8d2e, 0x5408abf7, 0x50c9b640,
    0x4e8ee645, 0x4a4ffbf2, 0x470cdd2b, 0x43cdc09c,
    0x7b827d21, 0x7f436096, 0x7200464f, 0x76c15bf8,
    0x68860bfd, 0x6c47164a, 0x61043093, 0x65c52d24,
    0x119b4be9, 0x155a565e, 0x18197087, 0x1cd86d30,
    0x029f3d35, 0x065e2082, 0x0b1d065b, 0x0fdc1bec,
    0x3793a651, 0x3352bbe6, 0x3e119d3f, 0x3ad08088,
    0x2497d08d, 0x2056cd3a, 0x2d15ebe3, 0x29d4f654,
    0xc5a92679, 0xc1683bce, 0xcc2b1d17, 0xc8ea00a0,
    0xd6ad50a5, 0xd26c4d12, 0xdf2f6bcb, 0xdbee767c,
    0xe3a1cbc1, 0xe760d676, 0xea23f0af, 0xeee2ed18,
    0xf0a5bd1d, 0xf464a0aa, 0xf9278673, 0xfde69bc4,
    0x89b8fd09, 0x8d79e0be, 0x803ac667, 0x84fbdbd0,
    0x9abc8bd5, 0x9e7d9662, 0x933eb0bb, 0x97ffad0c,
    0xafb010b1, 0xab710d06, 0xa6322bdf, 0xa2f33668,
    0xbcb4666d, 0xb8757bda, 0xb5365d03, 0xb1f740b4
]);

/**
 * Calculate OGG page checksum
 */
function checksum(data, bytes) {
    let crcReg = 0;
    for (let i = 0; i < bytes; i++) {
        crcReg = ((crcReg << 8) ^ CRC_LOOKUP[((crcReg >>> 24) & 0xff) ^ data[i]]) >>> 0;
    }
    return crcReg;
}

/**
 * Read 16-bit little endian value
 */
function read16LE(data, offset = 0) {
    return data[offset] | (data[offset + 1] << 8);
}

/**
 * Read 32-bit little endian value
 */
function read32LE(data, offset = 0) {
    return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

/**
 * Read 16-bit big endian value
 */
function read16BE(data, offset = 0) {
    return (data[offset] << 8) | data[offset + 1];
}

/**
 * Read 32-bit big endian value
 */
function read32BE(data, offset = 0) {
    return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

/**
 * Write 32-bit little endian value
 */
function write32LE(data, offset, value) {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >>> 8) & 0xff;
    data[offset + 2] = (value >>> 16) & 0xff;
    data[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Write 16-bit little endian value
 */
function write16LE(data, offset, value) {
    data[offset] = value & 0xff;
    data[offset + 1] = (value >>> 8) & 0xff;
}

/**
 * Calculate ilog (integer log2)
 */
function ilog(v) {
    let ret = 0;
    while (v) {
        ret++;
        v >>>= 1;
    }
    return ret;
}

/**
 * Calculate quantvals for maptype 1 lookup
 */
function bookMaptype1Quantvals(entries, dimensions) {
    const bits = ilog(entries);
    let vals = entries >>> ((bits - 1) * (dimensions - 1) / dimensions);

    while (true) {
        let acc = 1;
        let acc1 = 1;
        for (let i = 0; i < dimensions; i++) {
            acc *= vals;
            acc1 *= vals + 1;
        }
        if (acc <= entries && acc1 > entries) {
            return vals;
        } else {
            if (acc > entries) {
                vals--;
            } else {
                vals++;
            }
        }
    }
}

/**
 * Bit stream reader (LSB first)
 */
class BitReader {
    constructor(data, initialPosition = 0) {
        this.data = data;
        this.initialPosition = initialPosition;
        this.bitBuffer = 0;
        this.bitsLeft = 0;
        this.totalBitsRead = 0;
    }

    getBit() {
        if (this.bitsLeft === 0) {
            const bytePos = this.initialPosition + Math.floor(this.totalBitsRead / 8);
            if (bytePos >= this.data.length) {
                throw new Error('Out of bits');
            }
            this.bitBuffer = this.data[bytePos];
            this.bitsLeft = 8;
        }
        this.totalBitsRead++;
        this.bitsLeft--;
        return ((this.bitBuffer & (0x80 >>> this.bitsLeft)) !== 0) ? 1 : 0;
    }

    readBits(count) {
        let value = 0;
        for (let i = 0; i < count; i++) {
            if (this.getBit()) {
                value |= (1 << i);
            }
        }
        return value;
    }

    getTotalBitsRead() {
        return this.totalBitsRead;
    }
}

/**
 * Bit stream writer for OGG output
 */
class BitOggWriter {
    constructor() {
        this.output = [];
        this.bitBuffer = 0;
        this.bitsStored = 0;
        this.payloadBytes = 0;
        this.first = true;
        this.continued = false;
        this.granule = 0;
        this.seqno = 0;
        this.pageBuffer = new Uint8Array(27 + 255 + 255 * 255);
    }

    putBit(bit) {
        if (bit) {
            this.bitBuffer |= (1 << this.bitsStored);
        }
        this.bitsStored++;
        if (this.bitsStored === 8) {
            this.flushBits();
        }
    }

    writeBits(value, count) {
        for (let i = 0; i < count; i++) {
            this.putBit((value & (1 << i)) !== 0);
        }
    }

    setGranule(g) {
        this.granule = g;
    }

    flushBits() {
        if (this.bitsStored !== 0) {
            if (this.payloadBytes === 255 * 255) {
                this.flushPage(true);
            }
            this.pageBuffer[27 + 255 + this.payloadBytes] = this.bitBuffer;
            this.payloadBytes++;
            this.bitsStored = 0;
            this.bitBuffer = 0;
        }
    }

    flushPage(nextContinued = false, last = false) {
        if (this.payloadBytes !== 255 * 255) {
            this.flushBits();
        }

        if (this.payloadBytes !== 0) {
            const segmentSize = 255;
            let segments = Math.ceil(this.payloadBytes / segmentSize);
            if (segments === 256) segments = 255;

            // Move payload back
            for (let i = 0; i < this.payloadBytes; i++) {
                this.pageBuffer[27 + segments + i] = this.pageBuffer[27 + 255 + i];
            }

            // Write OGG header
            this.pageBuffer[0] = 0x4F; // O
            this.pageBuffer[1] = 0x67; // g
            this.pageBuffer[2] = 0x67; // g
            this.pageBuffer[3] = 0x53; // S
            this.pageBuffer[4] = 0; // stream_structure_version
            this.pageBuffer[5] = (this.continued ? 1 : 0) | (this.first ? 2 : 0) | (last ? 4 : 0);

            // Granule position (64 bits, but we only use 32)
            write32LE(this.pageBuffer, 6, this.granule);
            if (this.granule === 0xFFFFFFFF) {
                write32LE(this.pageBuffer, 10, 0xFFFFFFFF);
            } else {
                write32LE(this.pageBuffer, 10, 0);
            }

            write32LE(this.pageBuffer, 14, 1); // Stream serial number
            write32LE(this.pageBuffer, 18, this.seqno); // Page sequence number
            write32LE(this.pageBuffer, 22, 0); // Checksum placeholder
            this.pageBuffer[26] = segments; // Segment count

            // Lacing values
            let bytesLeft = this.payloadBytes;
            for (let i = 0; i < segments; i++) {
                if (bytesLeft >= segmentSize) {
                    bytesLeft -= segmentSize;
                    this.pageBuffer[27 + i] = segmentSize;
                } else {
                    this.pageBuffer[27 + i] = bytesLeft;
                }
            }

            // Calculate and write checksum
            const pageSize = 27 + segments + this.payloadBytes;
            const crc = checksum(this.pageBuffer, pageSize);
            write32LE(this.pageBuffer, 22, crc);

            // Copy to output
            for (let i = 0; i < pageSize; i++) {
                this.output.push(this.pageBuffer[i]);
            }

            this.seqno++;
            this.first = false;
            this.continued = nextContinued;
            this.payloadBytes = 0;
        }
    }

    getOutput() {
        this.flushPage();
        return new Uint8Array(this.output);
    }
}

/**
 * Codebook library for Vorbis decoding
 * Handles packed_codebooks_aoTuV_603.bin format
 */
class CodebookLibrary {
    constructor(data = null) {
        this.codebookData = null;
        this.codebookOffsets = null;
        this.codebookCount = 0;

        if (data && data.length > 4) {
            // Ensure we have a proper Uint8Array
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

            // The last 4 bytes contain the offset to the offset table
            const len = bytes.length;
            const offsetOffset = bytes[len - 4] | (bytes[len - 3] << 8) | (bytes[len - 2] << 16) | ((bytes[len - 1] << 24) >>> 0);

            console.log('[CodebookLibrary] File size:', len, 'offset table at:', offsetOffset);

            if (offsetOffset >= len || offsetOffset < 0) {
                console.error('[CodebookLibrary] Invalid offset table position');
                return;
            }

            // Number of offsets = (file_size - offset_table_position) / 4
            // The last entry is a sentinel pointing to end of data, so actual count is offsets - 1
            const numOffsets = Math.floor((len - offsetOffset) / 4);
            this.codebookCount = numOffsets - 1;

            // Store the data portion (everything before offset table)
            this.codebookData = bytes.slice(0, offsetOffset);

            // Read all offsets
            this.codebookOffsets = [];
            for (let i = 0; i < numOffsets; i++) {
                const pos = offsetOffset + i * 4;
                const offset = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | ((bytes[pos + 3] << 24) >>> 0);
                this.codebookOffsets.push(offset);
            }

            console.log('[CodebookLibrary] Loaded', this.codebookCount, 'codebooks');
            if (this.codebookCount > 0) {
                console.log('[CodebookLibrary] First offset:', this.codebookOffsets[0], 'Last offset:', this.codebookOffsets[this.codebookCount]);
            }
        }
    }

    getCodebook(i) {
        if (!this.codebookData || !this.codebookOffsets) {
            throw new Error('Codebook library not loaded');
        }
        if (i < 0 || i >= this.codebookCount) {
            console.log('[CodebookLibrary] Invalid codebook id:', i, 'max:', this.codebookCount - 1);
            return null;
        }
        const start = this.codebookOffsets[i];
        const end = this.codebookOffsets[i + 1];
        return this.codebookData.slice(start, end);
    }

    getCodebookSize(i) {
        if (!this.codebookData || !this.codebookOffsets) {
            throw new Error('Codebook library not loaded');
        }
        if (i < 0 || i >= this.codebookCount) return -1;
        return this.codebookOffsets[i + 1] - this.codebookOffsets[i];
    }

    rebuildFromId(i, bos) {
        const cb = this.getCodebook(i);
        const cbSize = this.getCodebookSize(i);

        if (!cb || cbSize === -1) {
            throw new Error(`Invalid codebook id: ${i}`);
        }

        const bis = new BitReader(cb, 0);
        this.rebuild(bis, cbSize, bos);
    }

    rebuild(bis, cbSize, bos) {
        // IN: 4 bit dimensions, 14 bit entry count
        const dimensions = bis.readBits(4);
        const entries = bis.readBits(14);

        // OUT: 24 bit identifier (0x564342 = "BCV"), 16 bit dimensions, 24 bit entry count
        bos.writeBits(0x564342, 24);
        bos.writeBits(dimensions, 16);
        bos.writeBits(entries, 24);

        // IN/OUT: 1 bit ordered flag
        const ordered = bis.readBits(1);
        bos.writeBits(ordered, 1);

        if (ordered) {
            // IN/OUT: 5 bit initial length
            const initialLength = bis.readBits(5);
            bos.writeBits(initialLength, 5);

            let currentEntry = 0;
            while (currentEntry < entries) {
                const numBits = ilog(entries - currentEntry);
                const number = bis.readBits(numBits);
                bos.writeBits(number, numBits);
                currentEntry += number;
            }
            if (currentEntry > entries) throw new Error('current_entry out of range');
        } else {
            // IN: 3 bit codeword length length, 1 bit sparse flag
            const codewordLengthLength = bis.readBits(3);
            const sparse = bis.readBits(1);

            if (codewordLengthLength === 0 || codewordLengthLength > 5) {
                throw new Error('nonsense codeword length');
            }

            // OUT: 1 bit sparse flag
            bos.writeBits(sparse, 1);

            for (let i = 0; i < entries; i++) {
                let presentBool = true;

                if (sparse) {
                    const present = bis.readBits(1);
                    bos.writeBits(present, 1);
                    presentBool = present !== 0;
                }

                if (presentBool) {
                    // IN: n bit codeword length-1
                    const codewordLength = bis.readBits(codewordLengthLength);
                    // OUT: 5 bit codeword length-1
                    bos.writeBits(codewordLength, 5);
                }
            }
        }

        // IN: 1 bit lookup type
        const lookupType = bis.readBits(1);
        // OUT: 4 bit lookup type
        bos.writeBits(lookupType, 4);

        if (lookupType === 0) {
            // No lookup table
        } else if (lookupType === 1) {
            // IN/OUT: 32 bit min, 32 bit max, 4 bit value length-1, 1 bit sequence flag
            const min = bis.readBits(32);
            const max = bis.readBits(32);
            const valueLength = bis.readBits(4);
            const sequenceFlag = bis.readBits(1);

            bos.writeBits(min, 32);
            bos.writeBits(max, 32);
            bos.writeBits(valueLength, 4);
            bos.writeBits(sequenceFlag, 1);

            const quantvals = bookMaptype1Quantvals(entries, dimensions);
            for (let i = 0; i < quantvals; i++) {
                const val = bis.readBits(valueLength + 1);
                bos.writeBits(val, valueLength + 1);
            }
        } else {
            throw new Error('Invalid lookup type');
        }
    }

    copy(bis, bos) {
        // IN: 24 bit identifier, 16 bit dimensions, 24 bit entry count
        const id = bis.readBits(24);
        const dimensions = bis.readBits(16);
        const entries = bis.readBits(24);

        if (id !== 0x564342) {
            throw new Error('Invalid codebook identifier');
        }

        // OUT: same
        bos.writeBits(id, 24);
        bos.writeBits(dimensions, 16);
        bos.writeBits(entries, 24);

        // IN/OUT: 1 bit ordered flag
        const ordered = bis.readBits(1);
        bos.writeBits(ordered, 1);

        if (ordered) {
            // IN/OUT: 5 bit initial length
            const initialLength = bis.readBits(5);
            bos.writeBits(initialLength, 5);

            let currentEntry = 0;
            while (currentEntry < entries) {
                const numBits = ilog(entries - currentEntry);
                const number = bis.readBits(numBits);
                bos.writeBits(number, numBits);
                currentEntry += number;
            }
        } else {
            // IN/OUT: 1 bit sparse flag
            const sparse = bis.readBits(1);
            bos.writeBits(sparse, 1);

            for (let i = 0; i < entries; i++) {
                let presentBool = true;

                if (sparse) {
                    const present = bis.readBits(1);
                    bos.writeBits(present, 1);
                    presentBool = present !== 0;
                }

                if (presentBool) {
                    const codewordLength = bis.readBits(5);
                    bos.writeBits(codewordLength, 5);
                }
            }
        }

        // IN/OUT: 4 bit lookup type
        const lookupType = bis.readBits(4);
        bos.writeBits(lookupType, 4);

        if (lookupType === 0) {
            // No lookup table
        } else if (lookupType === 1) {
            const min = bis.readBits(32);
            const max = bis.readBits(32);
            const valueLength = bis.readBits(4);
            const sequenceFlag = bis.readBits(1);

            bos.writeBits(min, 32);
            bos.writeBits(max, 32);
            bos.writeBits(valueLength, 4);
            bos.writeBits(sequenceFlag, 1);

            const quantvals = bookMaptype1Quantvals(entries, dimensions);
            for (let i = 0; i < quantvals; i++) {
                const val = bis.readBits(valueLength + 1);
                bos.writeBits(val, valueLength + 1);
            }
        } else if (lookupType === 2) {
            throw new Error("Didn't expect lookup type 2");
        } else {
            throw new Error('Invalid lookup type');
        }
    }
}

/**
 * Packet header reader (modern 2 or 6 byte header)
 */
class Packet {
    constructor(data, offset, littleEndian, noGranule = false) {
        this._offset = offset;
        this._noGranule = noGranule;

        const read16 = littleEndian ? read16LE : read16BE;
        const read32 = littleEndian ? read32LE : read32BE;

        this._size = read16(data, offset);
        this._absoluteGranule = noGranule ? 0 : read32(data, offset + 2);
    }

    headerSize() { return this._noGranule ? 2 : 6; }
    offset() { return this._offset + this.headerSize(); }
    size() { return this._size; }
    granule() { return this._absoluteGranule; }
    nextOffset() { return this._offset + this.headerSize() + this._size; }
}

/**
 * Old 8 byte packet header
 */
class Packet8 {
    constructor(data, offset, littleEndian) {
        const read32 = littleEndian ? read32LE : read32BE;

        this._offset = offset;
        this._size = read32(data, offset);
        this._absoluteGranule = read32(data, offset + 4);
    }

    headerSize() { return 8; }
    offset() { return this._offset + this.headerSize(); }
    size() { return this._size; }
    granule() { return this._absoluteGranule; }
    nextOffset() { return this._offset + this.headerSize() + this._size; }
}

/**
 * Main WEM to OGG converter class
 */
class WwiseRiffVorbis {
    constructor(data, codebookData = null) {
        this.data = data;
        this.littleEndian = true;
        this.isWav = false;

        // Chunk offsets
        this.fmtOffset = -1;
        this.cueOffset = -1;
        this.listOffset = -1;
        this.smplOffset = -1;
        this.vorbOffset = -1;
        this.dataOffset = -1;

        // Chunk sizes
        this.fmtSize = -1;
        this.dataSize = -1;
        this.vorbSize = -1;

        // Audio properties
        this.channels = 0;
        this.sampleRate = 0;
        this.avgBytesPerSecond = 0;
        this.blockAlign = 0;
        this.bitsPerSample = 0;
        this.sampleCount = 0;

        // Vorbis properties
        this.setupPacketOffset = 0;
        this.firstAudioPacketOffset = 0;
        this.blocksize0Pow = 0;
        this.blocksize1Pow = 0;
        this.uid = 0;

        // Flags
        this.headerTriadPresent = false;
        this.oldPacketHeaders = false;
        this.noGranule = false;
        this.modPackets = false;

        // Loop info
        this.loopCount = 0;
        this.loopStart = 0;
        this.loopEnd = 0;

        // Codebook library
        this.codebookLibrary = codebookData ? new CodebookLibrary(codebookData) : new CodebookLibrary();

        this._parseRiff();
    }

    _parseRiff() {
        // Check RIFF header
        const magic = String.fromCharCode(this.data[0], this.data[1], this.data[2], this.data[3]);

        if (magic === 'RIFX') {
            this.littleEndian = false;
        } else if (magic !== 'RIFF') {
            throw new Error('Missing RIFF header');
        }

        const read16 = this.littleEndian ? read16LE : read16BE;
        const read32 = this.littleEndian ? read32LE : read32BE;

        this.riffSize = read32(this.data, 4) + 8;
        if (this.riffSize > this.data.length) {
            throw new Error('RIFF truncated');
        }

        const waveHead = String.fromCharCode(this.data[8], this.data[9], this.data[10], this.data[11]);
        if (waveHead !== 'WAVE') {
            throw new Error('Missing WAVE header');
        }

        // Read chunks
        let chunkOffset = 12;
        while (chunkOffset < this.riffSize) {
            if (chunkOffset + 8 > this.riffSize) {
                throw new Error('Chunk header truncated');
            }

            const chunkType = String.fromCharCode(
                this.data[chunkOffset],
                this.data[chunkOffset + 1],
                this.data[chunkOffset + 2],
                this.data[chunkOffset + 3]
            );
            const chunkSize = read32(this.data, chunkOffset + 4);

            if (chunkType === 'fmt ') {
                this.fmtOffset = chunkOffset + 8;
                this.fmtSize = chunkSize;
            } else if (chunkType === 'cue ') {
                this.cueOffset = chunkOffset + 8;
            } else if (chunkType === 'LIST') {
                this.listOffset = chunkOffset + 8;
            } else if (chunkType === 'smpl') {
                this.smplOffset = chunkOffset + 8;
            } else if (chunkType === 'vorb') {
                this.vorbOffset = chunkOffset + 8;
                this.vorbSize = chunkSize;
            } else if (chunkType === 'data') {
                this.dataOffset = chunkOffset + 8;
                this.dataSize = chunkSize;
            }

            chunkOffset = chunkOffset + 8 + chunkSize;
        }

        if (this.fmtOffset === -1 || this.dataOffset === -1) {
            throw new Error('Expected fmt, data chunks');
        }

        // Read fmt
        if (this.vorbOffset === -1) {
            if (this.fmtSize === 0x18) {
                this.isWav = true;
            } else if (this.fmtSize === 0x42) {
                this.vorbOffset = this.fmtOffset + 0x18;
            } else {
                throw new Error('Expected fmt_size of 0x18 or 0x42 if vorb section missing');
            }
        }

        const codecId = read16(this.data, this.fmtOffset);
        if ((this.isWav && codecId !== 0xFFFE) || (!this.isWav && codecId !== 0xFFFF)) {
            throw new Error('Bad codec id');
        }

        this.channels = read16(this.data, this.fmtOffset + 2);
        this.sampleRate = read32(this.data, this.fmtOffset + 4);
        this.avgBytesPerSecond = read32(this.data, this.fmtOffset + 8);
        this.blockAlign = read16(this.data, this.fmtOffset + 12);
        this.bitsPerSample = read16(this.data, this.fmtOffset + 14);

        if (this.isWav) return;

        // Read smpl for loop info
        if (this.smplOffset !== -1) {
            this.loopCount = read32(this.data, this.smplOffset + 0x1C);
            if (this.loopCount === 1) {
                this.loopStart = read32(this.data, this.smplOffset + 0x2C);
                this.loopEnd = read32(this.data, this.smplOffset + 0x30);
            }
        }

        // Read vorb
        const validVorbSizes = [-1, 0x28, 0x2A, 0x2C, 0x32, 0x34];
        if (!validVorbSizes.includes(this.vorbSize)) {
            throw new Error('Bad vorb size');
        }

        this.sampleCount = read32(this.data, this.vorbOffset);

        let filePos;
        if (this.vorbSize === -1 || this.vorbSize === 0x2A) {
            this.noGranule = true;
            const modSignal = read32(this.data, this.vorbOffset + 0x4);

            if (modSignal !== 0x4A && modSignal !== 0x4B && modSignal !== 0x69 && modSignal !== 0x70) {
                this.modPackets = true;
            }
            filePos = this.vorbOffset + 0x10;
        } else {
            filePos = this.vorbOffset + 0x18;
        }

        this.setupPacketOffset = read32(this.data, filePos);
        this.firstAudioPacketOffset = read32(this.data, filePos + 4);

        if (this.vorbSize === -1 || this.vorbSize === 0x2A) {
            filePos = this.vorbOffset + 0x24;
        } else if (this.vorbSize === 0x32 || this.vorbSize === 0x34) {
            filePos = this.vorbOffset + 0x2C;
        }

        if (this.vorbSize === 0x28 || this.vorbSize === 0x2C) {
            this.headerTriadPresent = true;
            this.oldPacketHeaders = true;
        } else {
            this.uid = read32(this.data, filePos);
            this.blocksize0Pow = this.data[filePos + 4];
            this.blocksize1Pow = this.data[filePos + 5];
        }

        // Set loop end
        if (this.loopCount !== 0) {
            if (this.loopEnd === 0) {
                this.loopEnd = this.sampleCount;
            } else {
                this.loopEnd = this.loopEnd + 1;
            }
        }
    }

    generateOgg() {
        const os = new BitOggWriter();

        if (this.isWav) {
            return this._generateWav();
        }

        let modeBlockflag = null;
        let modeBits = 0;
        let prevBlockflag = false;

        if (this.headerTriadPresent) {
            this._generateOggHeaderWithTriad(os);
        } else {
            const result = this._generateOggHeader(os);
            modeBlockflag = result.modeBlockflag;
            modeBits = result.modeBits;
        }

        // Audio pages
        let offset = this.dataOffset + this.firstAudioPacketOffset;

        while (offset < this.dataOffset + this.dataSize) {
            let packet;
            if (this.oldPacketHeaders) {
                packet = new Packet8(this.data, offset, this.littleEndian);
            } else {
                packet = new Packet(this.data, offset, this.littleEndian, this.noGranule);
            }

            const size = packet.size();
            const packetPayloadOffset = packet.offset();
            const granule = packet.granule();
            const nextOffset = packet.nextOffset();

            if (offset + packet.headerSize() > this.dataOffset + this.dataSize) {
                throw new Error('Page header truncated');
            }

            offset = packetPayloadOffset;

            if (granule === 0xFFFFFFFF) {
                os.setGranule(1);
            } else {
                os.setGranule(granule);
            }

            // First byte handling
            if (this.modPackets) {
                if (!modeBlockflag) {
                    throw new Error("Didn't load mode_blockflag");
                }

                // OUT: 1 bit packet type (0 == audio)
                os.writeBits(0, 1);

                const ss = new BitReader(this.data, offset);

                // IN/OUT: N bit mode number
                const modeNumber = ss.readBits(modeBits);
                os.writeBits(modeNumber, modeBits);

                // IN: remaining bits of first byte
                const remainder = ss.readBits(8 - modeBits);

                if (modeBlockflag[modeNumber]) {
                    // Long window - peek at next frame
                    let nextBlockflag = false;
                    if (nextOffset + packet.headerSize() <= this.dataOffset + this.dataSize) {
                        const nextPacket = new Packet(this.data, nextOffset, this.littleEndian, this.noGranule);
                        const nextPacketSize = nextPacket.size();
                        if (nextPacketSize > 0) {
                            const nextSs = new BitReader(this.data, nextPacket.offset());
                            const nextModeNumber = nextSs.readBits(modeBits);
                            nextBlockflag = modeBlockflag[nextModeNumber];
                        }
                    }

                    // OUT: previous window type bit
                    os.writeBits(prevBlockflag ? 1 : 0, 1);
                    // OUT: next window type bit
                    os.writeBits(nextBlockflag ? 1 : 0, 1);
                }

                prevBlockflag = modeBlockflag[modeNumber];

                // OUT: remaining bits of first byte
                os.writeBits(remainder, 8 - modeBits);
            } else {
                // Normal first byte
                os.writeBits(this.data[offset], 8);
            }

            // Remainder of packet
            for (let i = 1; i < size; i++) {
                os.writeBits(this.data[offset + i], 8);
            }

            offset = nextOffset;
            os.flushPage(false, offset === this.dataOffset + this.dataSize);
        }

        return os.getOutput();
    }

    _generateWav() {
        // Create WAV header
        const totalSize = 44 + this.dataSize;
        const output = new Uint8Array(totalSize);

        // RIFF header
        output.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
        write32LE(output, 4, totalSize - 8);
        output.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

        // fmt chunk
        output.set([0x66, 0x6D, 0x74, 0x20], 12); // "fmt "
        write32LE(output, 16, 16); // fmt chunk size
        write16LE(output, 20, 1); // Audio format (PCM)
        write16LE(output, 22, this.channels);
        write32LE(output, 24, this.sampleRate);
        write32LE(output, 28, this.avgBytesPerSecond);
        write16LE(output, 32, this.blockAlign);
        write16LE(output, 34, this.bitsPerSample);

        // data chunk
        output.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
        write32LE(output, 40, this.dataSize);

        // Copy audio data
        output.set(this.data.slice(this.dataOffset, this.dataOffset + this.dataSize), 44);

        return output;
    }

    _generateOggHeader(os) {
        // Generate identification packet
        this._writeVorbisPacketHeader(os, 1);

        os.writeBits(0, 32); // Version
        os.writeBits(this.channels, 8);
        os.writeBits(this.sampleRate, 32);
        os.writeBits(0, 32); // Bitrate max
        os.writeBits(this.avgBytesPerSecond * 8, 32); // Bitrate nominal
        os.writeBits(0, 32); // Bitrate min
        os.writeBits(this.blocksize0Pow, 4);
        os.writeBits(this.blocksize1Pow, 4);
        os.writeBits(1, 1); // Framing

        os.flushPage();

        // Generate comment packet
        this._writeVorbisPacketHeader(os, 3);

        const vendor = 'converted from Audiokinetic Wwise by ww2ogg.js';
        os.writeBits(vendor.length, 32);
        for (let i = 0; i < vendor.length; i++) {
            os.writeBits(vendor.charCodeAt(i), 8);
        }

        if (this.loopCount === 0) {
            os.writeBits(0, 32); // No user comments
        } else {
            os.writeBits(2, 32); // Two comments

            const loopStart = `LoopStart=${this.loopStart}`;
            os.writeBits(loopStart.length, 32);
            for (let i = 0; i < loopStart.length; i++) {
                os.writeBits(loopStart.charCodeAt(i), 8);
            }

            const loopEnd = `LoopEnd=${this.loopEnd}`;
            os.writeBits(loopEnd.length, 32);
            for (let i = 0; i < loopEnd.length; i++) {
                os.writeBits(loopEnd.charCodeAt(i), 8);
            }
        }

        os.writeBits(1, 1); // Framing
        os.flushPage();

        // Generate setup packet
        this._writeVorbisPacketHeader(os, 5);

        const setupPacket = new Packet(this.data, this.dataOffset + this.setupPacketOffset, this.littleEndian, this.noGranule);

        if (setupPacket.granule() !== 0) {
            throw new Error('Setup packet granule != 0');
        }

        const ss = new BitReader(this.data, setupPacket.offset());

        // Codebook count
        const codebookCountLess1 = ss.readBits(8);
        const codebookCount = codebookCountLess1 + 1;
        os.writeBits(codebookCountLess1, 8);

        // Rebuild codebooks using external codebook library
        for (let i = 0; i < codebookCount; i++) {
            const codebookId = ss.readBits(10);
            try {
                this.codebookLibrary.rebuildFromId(codebookId, os);
            } catch (e) {
                if (codebookId === 0x342) {
                    throw new Error('Invalid codebook id 0x342, try --full-setup');
                }
                throw e;
            }
        }

        // Time domain transforms (placeholder)
        os.writeBits(0, 6); // Time count - 1
        os.writeBits(0, 16); // Dummy time value

        // Rebuild floors, residues, mappings, modes
        const result = this._rebuildSetup(ss, os, codebookCount);

        os.writeBits(1, 1); // Framing
        os.flushPage();

        return result;
    }

    _rebuildSetup(ss, os, codebookCount) {
        // Floor count
        const floorCountLess1 = ss.readBits(6);
        const floorCount = floorCountLess1 + 1;
        os.writeBits(floorCountLess1, 6);

        // Rebuild floors
        for (let i = 0; i < floorCount; i++) {
            // Always floor type 1
            os.writeBits(1, 16);

            const floor1Partitions = ss.readBits(5);
            os.writeBits(floor1Partitions, 5);

            const floor1PartitionClassList = [];
            let maximumClass = 0;

            for (let j = 0; j < floor1Partitions; j++) {
                const floor1PartitionClass = ss.readBits(4);
                os.writeBits(floor1PartitionClass, 4);
                floor1PartitionClassList.push(floor1PartitionClass);
                if (floor1PartitionClass > maximumClass) {
                    maximumClass = floor1PartitionClass;
                }
            }

            const floor1ClassDimensionsList = [];

            for (let j = 0; j <= maximumClass; j++) {
                const classDimensionsLess1 = ss.readBits(3);
                os.writeBits(classDimensionsLess1, 3);
                floor1ClassDimensionsList.push(classDimensionsLess1 + 1);

                const classSubclasses = ss.readBits(2);
                os.writeBits(classSubclasses, 2);

                if (classSubclasses !== 0) {
                    const masterbook = ss.readBits(8);
                    os.writeBits(masterbook, 8);
                    if (masterbook >= codebookCount) {
                        throw new Error('Invalid floor1 masterbook');
                    }
                }

                for (let k = 0; k < (1 << classSubclasses); k++) {
                    const subclassBookPlus1 = ss.readBits(8);
                    os.writeBits(subclassBookPlus1, 8);
                }
            }

            const floor1MultiplierLess1 = ss.readBits(2);
            os.writeBits(floor1MultiplierLess1, 2);

            const rangebits = ss.readBits(4);
            os.writeBits(rangebits, 4);

            for (let j = 0; j < floor1Partitions; j++) {
                const currentClassNumber = floor1PartitionClassList[j];
                for (let k = 0; k < floor1ClassDimensionsList[currentClassNumber]; k++) {
                    const X = ss.readBits(rangebits);
                    os.writeBits(X, rangebits);
                }
            }
        }

        // Residue count
        const residueCountLess1 = ss.readBits(6);
        const residueCount = residueCountLess1 + 1;
        os.writeBits(residueCountLess1, 6);

        // Rebuild residues
        for (let i = 0; i < residueCount; i++) {
            const residueType = ss.readBits(2);
            os.writeBits(residueType, 16);

            if (residueType > 2) throw new Error('Invalid residue type');

            const residueBegin = ss.readBits(24);
            const residueEnd = ss.readBits(24);
            const residuePartitionSizeLess1 = ss.readBits(24);
            const residueClassificationsLess1 = ss.readBits(6);
            const residueClassbook = ss.readBits(8);

            const residueClassifications = residueClassificationsLess1 + 1;

            os.writeBits(residueBegin, 24);
            os.writeBits(residueEnd, 24);
            os.writeBits(residuePartitionSizeLess1, 24);
            os.writeBits(residueClassificationsLess1, 6);
            os.writeBits(residueClassbook, 8);

            if (residueClassbook >= codebookCount) {
                throw new Error('Invalid residue classbook');
            }

            const residueCascade = [];

            for (let j = 0; j < residueClassifications; j++) {
                const lowBits = ss.readBits(3);
                os.writeBits(lowBits, 3);

                const bitflag = ss.readBits(1);
                os.writeBits(bitflag, 1);

                let highBits = 0;
                if (bitflag) {
                    highBits = ss.readBits(5);
                    os.writeBits(highBits, 5);
                }

                residueCascade.push(highBits * 8 + lowBits);
            }

            for (let j = 0; j < residueClassifications; j++) {
                for (let k = 0; k < 8; k++) {
                    if (residueCascade[j] & (1 << k)) {
                        const residueBook = ss.readBits(8);
                        os.writeBits(residueBook, 8);
                        if (residueBook >= codebookCount) {
                            throw new Error('Invalid residue book');
                        }
                    }
                }
            }
        }

        // Mapping count
        const mappingCountLess1 = ss.readBits(6);
        const mappingCount = mappingCountLess1 + 1;
        os.writeBits(mappingCountLess1, 6);

        for (let i = 0; i < mappingCount; i++) {
            // Always mapping type 0
            os.writeBits(0, 16);

            const submapsFlag = ss.readBits(1);
            os.writeBits(submapsFlag, 1);

            let submaps = 1;
            if (submapsFlag) {
                const submapsLess1 = ss.readBits(4);
                submaps = submapsLess1 + 1;
                os.writeBits(submapsLess1, 4);
            }

            const squarePolarFlag = ss.readBits(1);
            os.writeBits(squarePolarFlag, 1);

            if (squarePolarFlag) {
                const couplingStepsLess1 = ss.readBits(8);
                const couplingSteps = couplingStepsLess1 + 1;
                os.writeBits(couplingStepsLess1, 8);

                const channelBits = ilog(this.channels - 1);
                for (let j = 0; j < couplingSteps; j++) {
                    const magnitude = ss.readBits(channelBits);
                    const angle = ss.readBits(channelBits);
                    os.writeBits(magnitude, channelBits);
                    os.writeBits(angle, channelBits);
                }
            }

            const mappingReserved = ss.readBits(2);
            os.writeBits(mappingReserved, 2);
            if (mappingReserved !== 0) {
                throw new Error('Mapping reserved field nonzero');
            }

            if (submaps > 1) {
                for (let j = 0; j < this.channels; j++) {
                    const mappingMux = ss.readBits(4);
                    os.writeBits(mappingMux, 4);
                }
            }

            for (let j = 0; j < submaps; j++) {
                const timeConfig = ss.readBits(8);
                os.writeBits(timeConfig, 8);

                const floorNumber = ss.readBits(8);
                os.writeBits(floorNumber, 8);
                if (floorNumber >= floorCount) {
                    throw new Error('Invalid floor mapping');
                }

                const residueNumber = ss.readBits(8);
                os.writeBits(residueNumber, 8);
                if (residueNumber >= residueCount) {
                    throw new Error('Invalid residue mapping');
                }
            }
        }

        // Mode count
        const modeCountLess1 = ss.readBits(6);
        const modeCount = modeCountLess1 + 1;
        os.writeBits(modeCountLess1, 6);

        const modeBlockflag = [];
        const modeBits = ilog(modeCount - 1);

        for (let i = 0; i < modeCount; i++) {
            const blockFlag = ss.readBits(1);
            os.writeBits(blockFlag, 1);
            modeBlockflag.push(blockFlag !== 0);

            // Window type and transform type (always 0)
            os.writeBits(0, 16);
            os.writeBits(0, 16);

            const mapping = ss.readBits(8);
            os.writeBits(mapping, 8);
            if (mapping >= mappingCount) {
                throw new Error('Invalid mode mapping');
            }
        }

        return { modeBlockflag, modeBits };
    }

    _generateOggHeaderWithTriad(os) {
        let offset = this.dataOffset + this.setupPacketOffset;

        // Copy identification packet
        const infoPacket = new Packet8(this.data, offset, this.littleEndian);

        if (infoPacket.granule() !== 0) {
            throw new Error('Information packet granule != 0');
        }

        const infoType = this.data[infoPacket.offset()];
        if (infoType !== 1) {
            throw new Error('Wrong type for information packet');
        }

        for (let i = 0; i < infoPacket.size(); i++) {
            os.writeBits(this.data[infoPacket.offset() + i], 8);
        }
        os.flushPage();

        offset = infoPacket.nextOffset();

        // Copy comment packet
        const commentPacket = new Packet8(this.data, offset, this.littleEndian);

        if (commentPacket.granule() !== 0) {
            throw new Error('Comment packet granule != 0');
        }

        const commentType = this.data[commentPacket.offset()];
        if (commentType !== 3) {
            throw new Error('Wrong type for comment packet');
        }

        for (let i = 0; i < commentPacket.size(); i++) {
            os.writeBits(this.data[commentPacket.offset() + i], 8);
        }
        os.flushPage();

        offset = commentPacket.nextOffset();

        // Copy setup packet
        const setupPacket = new Packet8(this.data, offset, this.littleEndian);

        if (setupPacket.granule() !== 0) {
            throw new Error('Setup packet granule != 0');
        }

        const ss = new BitReader(this.data, setupPacket.offset());

        const setupType = ss.readBits(8);
        if (setupType !== 5) {
            throw new Error('Wrong type for setup packet');
        }
        os.writeBits(setupType, 8);

        // 'vorbis'
        for (let i = 0; i < 6; i++) {
            os.writeBits(ss.readBits(8), 8);
        }

        // Codebook count
        const codebookCountLess1 = ss.readBits(8);
        const codebookCount = codebookCountLess1 + 1;
        os.writeBits(codebookCountLess1, 8);

        const cbl = new CodebookLibrary();

        // Rebuild codebooks
        for (let i = 0; i < codebookCount; i++) {
            cbl.copy(ss, os);
        }

        // Copy remaining bits
        while (ss.getTotalBitsRead() < setupPacket.size() * 8) {
            os.writeBits(ss.readBits(1), 1);
        }

        os.flushPage();
    }

    _writeVorbisPacketHeader(os, packetType) {
        os.writeBits(packetType, 8);
        // 'vorbis'
        const vorbis = 'vorbis';
        for (let i = 0; i < 6; i++) {
            os.writeBits(vorbis.charCodeAt(i), 8);
        }
    }
}

/**
 * Convert WEM data to OGG or WAV
 * @param {Uint8Array} wemData - The WEM file data
 * @param {Uint8Array} codebookData - Optional codebook data for external codebooks
 * @returns {Uint8Array} The converted OGG or WAV data
 */
export function wemToOgg(wemData, codebookData = null) {
    const converter = new WwiseRiffVorbis(wemData, codebookData);
    return converter.generateOgg();
}

/**
 * Check if WEM data is actually WAV (PCM) data
 */
export function isWemWav(wemData) {
    const converter = new WwiseRiffVorbis(wemData);
    return converter.isWav;
}

/**
 * Decode WEM/OGG data into an AudioBuffer via OfflineAudioContext.
 * Works in both renderer and main process (renderer only — requires Web Audio API).
 */
async function decodeToAudioBuffer(wemData, codebookData = null) {
    // First convert WEM → OGG/WAV bytes
    const oggData = wemToOgg(wemData, codebookData);

    // Decode OGG/WAV bytes → AudioBuffer
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    try {
        const arrayBuf = oggData.buffer.slice(oggData.byteOffset, oggData.byteOffset + oggData.byteLength);
        const audioBuffer = await ctx.decodeAudioData(arrayBuf);
        return audioBuffer;
    } finally {
        ctx.close();
    }
}

/**
 * Encode an AudioBuffer to a standard WAV (PCM 16-bit) Uint8Array.
 */
function audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const length = audioBuffer.length;
    const dataSize = length * numChannels * bytesPerSample;
    const totalSize = 44 + dataSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);              // chunk size
    view.setUint16(20, 1, true);               // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave channels and write PCM samples
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(audioBuffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            let sample = channels[ch][i];
            sample = Math.max(-1, Math.min(1, sample));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    return new Uint8Array(buffer);
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Convert WEM data to WAV (PCM 16-bit).
 * @param {Uint8Array} wemData
 * @param {Uint8Array} codebookData
 * @returns {Promise<Uint8Array>}
 */
export async function wemToWav(wemData, codebookData = null) {
    const audioBuffer = await decodeToAudioBuffer(wemData, codebookData);
    return audioBufferToWav(audioBuffer);
}

/**
 * Convert WEM data to MP3 (128 kbps).
 * @param {Uint8Array} wemData
 * @param {Uint8Array} codebookData
 * @param {number} kbps - Bitrate in kbps (default 128)
 * @returns {Promise<Uint8Array>}
 */
export async function wemToMp3(wemData, codebookData = null, kbps = 128) {
    const lamejs = await import('lamejs');
    const audioBuffer = await decodeToAudioBuffer(wemData, codebookData);

    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Get PCM int16 data per channel
    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) {
        const float32 = audioBuffer.getChannelData(ch);
        const int16 = new Int16Array(length);
        for (let i = 0; i < length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        channels.push(int16);
    }

    const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
    const mp3Data = [];
    const blockSize = 1152;

    for (let i = 0; i < length; i += blockSize) {
        const leftChunk = channels[0].subarray(i, i + blockSize);
        let mp3buf;
        if (numChannels === 1) {
            mp3buf = mp3encoder.encodeBuffer(leftChunk);
        } else {
            const rightChunk = channels[1].subarray(i, i + blockSize);
            mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
        }
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }

    const end = mp3encoder.flush();
    if (end.length > 0) {
        mp3Data.push(end);
    }

    // Concatenate all chunks
    const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of mp3Data) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

export { WwiseRiffVorbis, BitReader, BitOggWriter, CodebookLibrary, checksum };
