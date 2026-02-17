/**
 * BIN Writer - Writes BIN file structures
 */

import { BytesStream } from './stream.js';
import { BINType } from './binTypes.js';
import { BINHasher } from './binHasher.js';
import { WADHasher } from './wadHasher.js';
import { BINField } from './binReader.js';

export class BINWriter {
    /**
     * Write a value based on type
     * @param {BytesStream} bs - Bytes stream (writer mode)
     * @param {*} value - Value to write
     * @param {number} valueType - BIN type value
     * @param {boolean} headerSize - Whether to include header size (5 bytes)
     * @returns {number} - Size written
     */
    static writeValue(bs, value, valueType, headerSize = false) {
        let size = 0;
        
        switch (valueType) {
            case BINType.NONE:
                size = 0;
                break;
            case BINType.BOOL:
                bs.writeBool(value);
                size = 1;
                break;
            case BINType.I8:
                bs.writeI8(value);
                size = 1;
                break;
            case BINType.U8:
                bs.writeU8(value);
                size = 1;
                break;
            case BINType.I16:
                bs.writeI16(value);
                size = 2;
                break;
            case BINType.U16:
                bs.writeU16(value);
                size = 2;
                break;
            case BINType.I32:
                bs.writeI32(value);
                size = 4;
                break;
            case BINType.U32:
                bs.writeU32(value);
                size = 4;
                break;
            case BINType.I64:
                bs.writeI64(value);
                size = 8;
                break;
            case BINType.U64:
                bs.writeU64(value);
                size = 8;
                break;
            case BINType.F32:
                bs.writeF32(value);
                size = 4;
                break;
            case BINType.VEC2:
                bs.writeVec2(value);
                size = 8;
                break;
            case BINType.VEC3:
                bs.writeVec3(value);
                size = 12;
                break;
            case BINType.VEC4:
                bs.writeVec4(value);
                size = 16;
                break;
            case BINType.MTX44:
                bs.writeMtx4(value);
                size = 64;
                break;
            case BINType.RGBA:
                bs.writeU8(...value);
                size = 4;
                break;
            case BINType.STRING:
                const strBuf = Buffer.from(value, 'utf-8');
                bs.writeU16(strBuf.length);
                bs.writeString(value, 'utf-8');
                size = 2 + strBuf.length;
                break;
            case BINType.HASH:
                bs.writeU32(BINHasher.rawOrHexToHash(value));
                size = 4;
                break;
            case BINType.FILE:
                bs.writeU64(WADHasher.rawOrHexToHash(value));
                size = 8;
                break;
            case BINType.LINK:
                bs.writeU32(BINHasher.rawOrHexToHash(value));
                size = 4;
                break;
            case BINType.LIST:
            case BINType.LIST2:
                // value is a BINField for LIST/LIST2
                if (!(value instanceof BINField)) {
                    throw new Error('LIST/LIST2 value must be a BINField');
                }
                return BINWriter.writeList(bs, value, valueType, headerSize);
            case BINType.POINTER:
            case BINType.EMBED:
                // value is a BINField for POINTER/EMBED
                if (!(value instanceof BINField)) {
                    throw new Error('POINTER/EMBED value must be a BINField');
                }
                return BINWriter.writePointerOrEmbed(bs, value, headerSize);
            case BINType.FLAG:
                bs.writeU8(value);
                size = 1;
                break;
            default:
                throw new Error(`Unknown BIN type: ${valueType}`);
        }
        
        return headerSize ? size + 5 : size;
    }

    /**
     * Write a list or list2
     * @param {BytesStream} bs - Bytes stream
     * @param {BINField} field - Field with valueType and data array
     * @param {number} listType - LIST or LIST2
     * @param {boolean} headerSize - Whether to include header size
     * @returns {number} - Size written
     */
    static writeList(bs, field, listType, headerSize = false) {
        let size = 0;
        
        // Write value type
        bs.writeU8(field.valueType);
        size += 1;
        
        // Write size placeholder
        const sizeOffset = bs.tell();
        bs.writeU32(0);
        size += 4;
        
        // Write count and items
        let contentSize = 4; // count size
        bs.writeU32(field.data.length);
        for (const item of field.data) {
            contentSize += BINWriter.writeValue(bs, item, field.valueType, false);
        }
        
        // Update size
        const currentPos = bs.tell();
        bs.seek(sizeOffset);
        bs.writeU32(contentSize);
        bs.seek(currentPos);
        
        size += contentSize;
        return headerSize ? size + 5 : size;
    }

    /**
     * Write a pointer or embed
     * @param {BytesStream} bs - Bytes stream
     * @param {BINField} field - Field with hashType and data
     * @param {boolean} headerSize - Whether to include header size
     * @returns {number} - Size written
     */
    static writePointerOrEmbed(bs, field, headerSize = false) {
        let size = 0;
        
        if (!field.hashType || field.hashType === '00000000' || !field.data) {
            bs.writeU32(0);
            size += 4;
        } else {
            bs.writeU32(BINHasher.rawOrHexToHash(field.hashType));
            size += 4;
            
            // Write size placeholder
            const sizeOffset = bs.tell();
            bs.writeU32(0);
            size += 4;
            
            // Write field count and fields
            let contentSize = 2; // count size
            bs.writeU16(field.data.length);
            for (const subField of field.data) {
                contentSize += BINWriter.writeField(bs, subField, true);
            }
            
            // Update size
            const currentPos = bs.tell();
            bs.seek(sizeOffset);
            bs.writeU32(contentSize);
            bs.seek(currentPos);
            
            size += contentSize;
        }
        
        return headerSize ? size + 5 : size;
    }

    /**
     * Write an option
     * @param {BytesStream} bs - Bytes stream
     * @param {BINField} field - Field with valueType and data
     * @param {boolean} headerSize - Whether to include header size
     * @returns {number} - Size written
     */
    static writeOption(bs, field, headerSize = false) {
        let size = 0;
        
        // valueType should always be set for OPTION fields
        if (!field.valueType && field.valueType !== 0) {
            throw new Error('OPTION field missing valueType');
        }
        
        bs.writeU8(field.valueType);
        size += 1;
        
        const count = field.data !== null && field.data !== undefined ? 1 : 0;
        bs.writeU8(count);
        size += 1;
        
        if (count !== 0 && field.valueType) {
            size += BINWriter.writeValue(bs, field.data, field.valueType, false);
        }
        
        return headerSize ? size + 5 : size;
    }

    /**
     * Write a map
     * @param {BytesStream} bs - Bytes stream
     * @param {BINField} field - Field with keyType, valueType, and data
     * @param {boolean} headerSize - Whether to include header size
     * @returns {number} - Size written
     */
    static writeMap(bs, field, headerSize = false) {
        let size = 0;
        
        bs.writeU8(field.keyType);
        bs.writeU8(field.valueType);
        size += 2;
        
        // Write size placeholder
        const sizeOffset = bs.tell();
        bs.writeU32(0);
        size += 4;
        
        // Write count and entries
        let contentSize = 4; // count size
        bs.writeU32(Object.keys(field.data).length);
        for (const [key, value] of Object.entries(field.data)) {
            contentSize += BINWriter.writeValue(bs, key, field.keyType, false);
            contentSize += BINWriter.writeValue(bs, value, field.valueType, false);
        }
        
        // Update size
        const currentPos = bs.tell();
        bs.seek(sizeOffset);
        bs.writeU32(contentSize);
        bs.seek(currentPos);
        
        size += contentSize;
        return headerSize ? size + 5 : size;
    }

    /**
     * Write a field
     * @param {BytesStream} bs - Bytes stream
     * @param {BINField} field - Field to write
     * @param {boolean} headerSize - Whether to include header size (5 bytes for hash+type)
     * @returns {number} - Size written
     */
    static writeField(bs, field, headerSize = false) {
        // Write hash and type
        bs.writeU32(BINHasher.rawOrHexToHash(field.hash));
        bs.writeU8(field.type);
        
        let size = 0;
        
        switch (field.type) {
            case BINType.LIST:
            case BINType.LIST2:
                size = BINWriter.writeList(bs, field, field.type, false);
                break;
            case BINType.POINTER:
            case BINType.EMBED:
                size = BINWriter.writePointerOrEmbed(bs, field, false);
                break;
            case BINType.OPTION:
                size = BINWriter.writeOption(bs, field, false);
                break;
            case BINType.MAP:
                size = BINWriter.writeMap(bs, field, false);
                break;
            default:
                size = BINWriter.writeValue(bs, field.data, field.type, false);
                break;
        }
        
        return headerSize ? size + 5 : size;
    }
}

