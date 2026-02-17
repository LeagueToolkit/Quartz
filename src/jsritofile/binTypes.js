/**
 * BIN Type enumeration
 * Maps to Python's BINType enum
 */

export const BINType = {
    // Basic types
    NONE: 0,
    BOOL: 1,
    I8: 2,
    U8: 3,
    I16: 4,
    U16: 5,
    I32: 6,
    U32: 7,
    I64: 8,
    U64: 9,
    F32: 10,
    VEC2: 11,
    VEC3: 12,
    VEC4: 13,
    MTX44: 14,
    RGBA: 15,
    STRING: 16,
    HASH: 17,
    FILE: 18,
    // Complex types
    LIST: 128,
    LIST2: 129,
    POINTER: 130,
    EMBED: 131,
    LINK: 132,
    OPTION: 133,
    MAP: 134,
    FLAG: 135
};

/**
 * Fix BIN type for legacy format
 * @param {BytesStream} bs - Bytes stream
 * @param {number} binType - BIN type value
 * @returns {number}
 */
export function fixBINType(bs, binType) {
    if (bs.legacyRead) {
        if (binType >= 129) {
            binType += 1;
        }
    }
    return binType;
}

