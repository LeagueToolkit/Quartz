/**
 * WAD Extensioner
 * Guesses file extensions from file signatures
 */

export class WADExtensioner {
    static signatureToExtension = {
        'OggS': 'ogg',
        '\x00\x01\x00\x00': 'ttf',
        '\x1A\x45\xDF\xA3': 'webm',
        'true': 'ttf',
        'OTTO\x00': 'otf',
        '"use strict";': 'min.js',
        '<template ': 'template.html',
        '<!-- Elements -->': 'template.html',
        'DDS ': 'dds',
        '<svg': 'svg',
        'PROP': 'bin',
        'PTCH': 'bin',
        'BKHD': 'bnk',
        'r3d2Mesh': 'scb',
        'r3d2anmd': 'anm',
        'r3d2canm': 'anm',
        'r3d2sklt': 'skl',
        'r3d2': 'wpk',
        '\x33\x22\x11\x00': 'skn',
        'PreLoadBuildingBlocks = {': 'preload',
        '\x1bLuaQ\x00\x01\x04\x04': 'luabin',
        '\x1bLuaQ\x00\x01\x04\x08': 'luabin64',
        '\x02\x3D\x00\x28': 'troybin',
        '[ObjectBegin]': 'sco',
        'OEGM': 'mapgeo',
        'TEX\x00': 'tex',
        'RW': 'wad',
        '\x89\x50\x4E\x47\x0D\x0A\x1A\x0A': 'png',
        '\xFF\xD8\xFF': 'jpg',
        'gimp xcf': 'xcf',
        '8BPS': 'psd',
        'BLENDER': 'blend',
        'Kaydara FBX Binary': 'fbx',
        'FOR4': 'mb',
        'FOR8': 'mb',
        '#MayaIcons': 'swatches',
        '#PROP_text': 'py',
        '\x5B\x0A\x20\x20': 'json',
        '\x7B\x0A\x20\x20': 'json',
    };

    /**
     * Guess file extension from data signature
     * @param {Buffer} data - File data
     * @returns {string|null} - Extension or null
     */
    static guessExtension(data) {
        if (!data || data.length < 4) return null;
        
        // Special case for skl (check bytes 4-8)
        if (data.length >= 8) {
            const bytes4to8 = data.slice(4, 8);
            if (bytes4to8.equals(Buffer.from([0xC3, 0x4F, 0xFD, 0x22]))) {
                return 'skl';
            }
        }
        
        // Check all signatures
        for (const [signature, extension] of Object.entries(WADExtensioner.signatureToExtension)) {
            const sigBuffer = Buffer.from(signature, 'binary');
            if (data.length >= sigBuffer.length && data.slice(0, sigBuffer.length).equals(sigBuffer)) {
                return extension;
            }
        }
        
        return null;
    }

    /**
     * Get extension from file path
     * @param {string} path - File path
     * @returns {string|null} - Extension or null
     */
    static getExtension(path) {
        if (!path) return null;
        
        if (path.toLowerCase().endsWith('.wad.client')) {
            return 'wad';
        }
        
        // Check if path ends with any known extension
        for (const extension of Object.values(WADExtensioner.signatureToExtension)) {
            if (path.toLowerCase().endsWith('.' + extension)) {
                return extension;
            }
        }
        
        return null;
    }
}








