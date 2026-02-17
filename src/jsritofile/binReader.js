/**
 * BIN Reader - Reads BIN file structures
 */

import { BytesStream } from './stream.js';
import { BINType, fixBINType } from './binTypes.js';
import { BINHasher } from './binHasher.js';
import { WADHasher } from './wadHasher.js';

export class BINField {
    constructor(hash, type, valueType = null, keyType = null, hashType = null, data = null) {
        this.hash = hash;
        this.type = type;
        this.valueType = valueType; // For LIST/LIST2/OPTION
        this.keyType = keyType; // For MAP
        this.hashType = hashType; // For POINTER/EMBED
        this.data = data;
    }
}

export class BINEntry {
    constructor() {
        this.type = null;
        this.hash = null;
        this.data = [];
    }
}

export class BINReader {
    /**
     * Read a value based on type
     * @param {BytesStream} bs - Bytes stream
     * @param {number} valueType - BIN type value
     * @returns {*} - Parsed value
     */
    static readValue(bs, valueType) {
        switch (valueType) {
            case BINType.NONE:
                return null;
            case BINType.BOOL:
                return bs.readBool();
            case BINType.I8:
                return bs.readI8();
            case BINType.U8:
                return bs.readU8();
            case BINType.I16:
                return bs.readI16();
            case BINType.U16:
                return bs.readU16();
            case BINType.I32:
                return bs.readI32();
            case BINType.U32:
                return bs.readU32();
            case BINType.I64:
                return bs.readU64();
            case BINType.U64:
                return bs.readU64();
            case BINType.F32:
                return bs.readF32();
            case BINType.VEC2:
                return bs.readVec2();
            case BINType.VEC3:
                return bs.readVec3();
            case BINType.VEC4:
                return bs.readVec4();
            case BINType.MTX44:
                return bs.readMtx4();
            case BINType.RGBA:
                return bs.readU8(4);
            case BINType.STRING:
                return bs.readStringSized16('utf-8');
            case BINType.HASH:
                return BINHasher.hashToHex(bs.readU32());
            case BINType.FILE:
                return WADHasher.hashToHex(bs.readU64());
            case BINType.LINK:
                return BINHasher.hashToHex(bs.readU32());
            case BINType.LIST:
            case BINType.LIST2:
                // LIST as a value is actually a field structure
                const listField = new BINField(null, valueType);
                const listResult = BINReader.readList(bs, valueType);
                listField.valueType = listResult.valueType;
                listField.data = listResult.data;
                return listField;
            case BINType.POINTER:
            case BINType.EMBED:
                // POINTER/EMBED as a value is actually a field structure
                const ptrField = new BINField(null, valueType);
                const ptr = BINReader.readPointerOrEmbed(bs, valueType);
                ptrField.hashType = ptr.hashType;
                ptrField.data = ptr.data;
                return ptrField;
            case BINType.FLAG:
                return bs.readU8();
            default:
                throw new Error(`Unknown BIN type: ${valueType}`);
        }
    }

    /**
     * Read a list or list2
     * @param {BytesStream} bs - Bytes stream
     * @param {number} listType - LIST or LIST2
     * @returns {Object} - {valueType, data}
     */
    static readList(bs, listType) {
        const valueType = fixBINType(bs, bs.readU8());
        bs.pad(4); // size
        const count = bs.readU32();
        const items = [];
        for (let i = 0; i < count; i++) {
            items.push(BINReader.readValue(bs, valueType));
        }
        return { valueType, data: items };
    }

    /**
     * Read a pointer or embed
     * @param {BytesStream} bs - Bytes stream
     * @param {number} pointerType - POINTER or EMBED
     * @returns {Object}
     */
    static readPointerOrEmbed(bs, pointerType) {
        const hashType = BINHasher.hashToHex(bs.readU32());
        if (hashType !== '00000000') {
            bs.pad(4); // size
            const count = bs.readU16();
            const fields = [];
            for (let i = 0; i < count; i++) {
                fields.push(BINReader.readField(bs));
            }
            return {
                hashType,
                data: fields
            };
        }
        return {
            hashType,
            data: null
        };
    }

    /**
     * Read an option
     * @param {BytesStream} bs - Bytes stream
     * @returns {Object} - {valueType, data}
     */
    static readOption(bs) {
        const valueType = fixBINType(bs, bs.readU8());
        const count = bs.readU8();
        let data = null;
        if (count !== 0) {
            data = BINReader.readValue(bs, valueType);
        }
        return { valueType, data };
    }

    /**
     * Read a map
     * @param {BytesStream} bs - Bytes stream
     * @returns {Object} - {keyType, valueType, data}
     */
    static readMap(bs) {
        const keyType = fixBINType(bs, bs.readU8());
        const valueType = fixBINType(bs, bs.readU8());
        bs.pad(4); // size
        const count = bs.readU32();
        const map = {};
        for (let i = 0; i < count; i++) {
            const key = BINReader.readValue(bs, keyType);
            const value = BINReader.readValue(bs, valueType);
            map[key] = value;
        }
        return { keyType, valueType, data: map };
    }

    /**
     * Read a field
     * @param {BytesStream} bs - Bytes stream
     * @returns {BINField}
     */
    static readField(bs) {
        const hash = BINHasher.hashToHex(bs.readU32());
        const type = fixBINType(bs, bs.readU8());
        
        const field = new BINField(hash, type);
        
        switch (type) {
            case BINType.LIST:
            case BINType.LIST2:
                const listResult = BINReader.readList(bs, type);
                field.valueType = listResult.valueType;
                field.data = listResult.data;
                break;
            case BINType.POINTER:
            case BINType.EMBED:
                const ptr = BINReader.readPointerOrEmbed(bs, type);
                field.data = ptr.data;
                field.hashType = ptr.hashType;
                break;
            case BINType.OPTION:
                const optionResult = BINReader.readOption(bs);
                field.valueType = optionResult.valueType;
                field.data = optionResult.data;
                break;
            case BINType.MAP:
                const mapResult = BINReader.readMap(bs);
                field.keyType = mapResult.keyType;
                field.valueType = mapResult.valueType;
                field.data = mapResult.data;
                break;
            default:
                field.data = BINReader.readValue(bs, type);
                break;
        }
        
        return field;
    }
}

