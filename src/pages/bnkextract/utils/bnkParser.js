/**
 * BNK/WPK Audio File Parser - JavaScript port of bnk-extract
 * Parses Wwise audio bank files (.bnk) and audio pack files (.wpk)
 */

/**
 * Audio data entry representing a single WEM file
 */
class AudioData {
    constructor(id, length, data) {
        this.id = id;
        this.length = length;
        this.data = data; // Uint8Array
        this.isModified = false;
    }
}

/**
 * Tree node for organizing audio files
 */
class AudioNode {
    constructor(name, audioData = null, id = null) {
        this.id = id || (audioData ? `audio-${audioData.id}` : `dir-${name}`);
        this.name = name;
        this.audioData = audioData; // AudioData or null for parent nodes
        this.children = [];
        this.isModified = false;
    }

    addChild(child) {
        this.children.push(child);
        return child;
    }

    findChild(name) {
        return this.children.find(c => c.name === name);
    }

    getOrCreateChild(name) {
        let child = this.findChild(name);
        if (!child) {
            child = new AudioNode(name);
            this.children.push(child);
        }
        return child;
    }
}

/**
 * Helper class for reading binary data with position tracking
 */
class BinaryReader {
    constructor(buffer) {
        this.buffer = buffer instanceof ArrayBuffer ? new DataView(buffer) : new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        this.uint8 = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
        this.position = 0;
        this.length = this.uint8.length;
    }

    seek(pos) {
        this.position = pos;
    }

    skip(bytes) {
        this.position += bytes;
    }

    tell() {
        return this.position;
    }

    remaining() {
        return this.length - this.position;
    }

    readUint8() {
        const val = this.buffer.getUint8(this.position);
        this.position += 1;
        return val;
    }

    readUint16LE() {
        const val = this.buffer.getUint16(this.position, true);
        this.position += 2;
        return val;
    }

    readUint32LE() {
        const val = this.buffer.getUint32(this.position, true);
        this.position += 4;
        return val;
    }

    readBytes(length) {
        const bytes = this.uint8.slice(this.position, this.position + length);
        this.position += length;
        return bytes;
    }

    readString(length) {
        const bytes = this.readBytes(length);
        return String.fromCharCode(...bytes);
    }

    readNullTerminatedString() {
        let str = '';
        while (this.position < this.length) {
            const byte = this.readUint8();
            if (byte === 0) break;
            str += String.fromCharCode(byte);
        }
        return str;
    }

    // Read wide string (UTF-16LE with every other byte as null)
    readWideString(charCount) {
        let str = '';
        for (let i = 0; i < charCount; i++) {
            str += String.fromCharCode(this.readUint8());
            this.skip(1); // Skip the null byte
        }
        return str;
    }
}

/**
 * Skip to a named section in a BNK file
 * @param {BinaryReader} reader 
 * @param {string} sectionName - 4 character section name like "DIDX", "DATA", "HIRC"
 * @param {boolean} fromBeginning - Start search from beginning
 * @returns {number} Section length or 0 if not found
 */
function skipToSection(reader, sectionName, fromBeginning = false) {
    if (fromBeginning) {
        reader.seek(0);
    }

    while (reader.remaining() >= 8) {
        const header = reader.readString(4);
        const sectionLength = reader.readUint32LE();

        if (header === sectionName) {
            return sectionLength;
        }

        // Skip this section
        reader.skip(sectionLength);
    }

    return 0;
}

/**
 * Parse BNK audio file
 * @param {ArrayBuffer|Uint8Array} buffer - File contents
 * @returns {Object} Parsed BNK data with audio entries
 */
export function parseBnkFile(buffer) {
    const reader = new BinaryReader(buffer);

    // Verify magic header
    const magic = reader.readString(4);
    if (magic !== 'BKHD') {
        throw new Error('Not a valid BNK file - missing BKHD header');
    }

    // Read BKHD section length and version
    const bkhdLength = reader.readUint32LE();
    const version = reader.readUint32LE();

    console.log(`[BNK Parser] Version: 0x${version.toString(16)}, BKHD length: ${bkhdLength}`);

    // Skip rest of BKHD section
    reader.skip(bkhdLength - 4);

    let entries = [];
    let audioFiles = [];

    const sections = new Map();
    while (reader.remaining() >= 8) {
        const header = reader.readString(4);
        const sectionLength = reader.readUint32LE();
        sections.set(header, { offset: reader.tell(), length: sectionLength });
        reader.skip(sectionLength);
    }

    if (sections.has('DIDX')) {
        const didx = sections.get('DIDX');
        reader.seek(didx.offset);
        const entryCount = didx.length / 12;
        for (let i = 0; i < entryCount; i++) {
            entries.push({
                fileId: reader.readUint32LE(),
                offset: reader.readUint32LE(),
                length: reader.readUint32LE()
            });
        }
    }

    if (sections.has('DATA') && entries.length > 0) {
        const dataSection = sections.get('DATA');
        for (const entry of entries) {
            reader.seek(dataSection.offset + entry.offset);
            const audioData = reader.readBytes(entry.length);
            audioFiles.push(new AudioData(entry.fileId, entry.length, audioData));
        }
    }

    // Sort by ID
    audioFiles.sort((a, b) => a.id - b.id);

    return {
        version,
        audioFiles,
        fileCount: audioFiles.length
    };
}

/**
 * Parse WPK audio pack file
 * @param {ArrayBuffer|Uint8Array} buffer - File contents
 * @returns {Object} Parsed WPK data with audio entries
 */
export function parseWpkFile(buffer) {
    const reader = new BinaryReader(buffer);

    // Verify magic header
    const magic = reader.readString(4);
    if (magic !== 'r3d2') {
        throw new Error('Not a valid WPK file - missing r3d2 header');
    }

    const version = reader.readUint32LE();
    const fileCount = reader.readUint32LE();

    console.log(`[WPK Parser] Version: ${version}, File count: ${fileCount}`);

    // Read offset table
    const offsets = [];
    for (let i = 0; i < fileCount; i++) {
        offsets.push(reader.readUint32LE());
    }

    // Count real files (offsets that aren't 0)
    const realFileCount = offsets.filter(o => o !== 0).length;

    // Parse file entries
    const audioFiles = [];

    for (let i = 0; i < offsets.length; i++) {
        if (offsets[i] === 0) continue; // Skip padding entries

        reader.seek(offsets[i]);

        const dataOffset = reader.readUint32LE();
        const dataLength = reader.readUint32LE();
        const filenameLength = reader.readUint32LE();

        // Read wide string filename
        const filename = reader.readWideString(filenameLength);

        // Extract ID from filename (e.g., "12345.wem" -> 12345)
        const id = parseInt(filename.replace('.wem', ''), 10);

        // Read audio data
        reader.seek(dataOffset);
        const data = reader.readBytes(dataLength);

        audioFiles.push(new AudioData(id, dataLength, data));
    }

    // Sort by ID
    audioFiles.sort((a, b) => a.id - b.id);

    console.log(`[WPK Parser] Parsed ${audioFiles.length} audio files`);

    return {
        version,
        audioFiles,
        fileCount: audioFiles.length
    };
}

/**
 * Detect file type and parse accordingly
 * @param {ArrayBuffer|Uint8Array} buffer - File contents
 * @param {string} filename - Original filename
 * @returns {Object} Parsed audio data
 */
export function parseAudioFile(buffer, filename) {
    const uint8 = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

    // Check magic bytes
    const magic = String.fromCharCode(uint8[0], uint8[1], uint8[2], uint8[3]);

    if (magic === 'BKHD') {
        return { type: 'bnk', ...parseBnkFile(buffer) };
    } else if (magic === 'r3d2') {
        return { type: 'wpk', ...parseWpkFile(buffer) };
    } else {
        throw new Error(`Unknown audio file format. Magic: "${magic}"`);
    }
}

/**
 * Find sequence of bytes in buffer
 * @param {Uint8Array} buffer 
 * @param {Uint8Array} sequence 
 * @param {number} startOffset
 * @returns {number} Offset of sequence or -1
 */
function findSequence(buffer, sequence, startOffset = 0) {
    const len = sequence.length;
    const max = buffer.length - len;

    for (let i = startOffset; i <= max; i++) {
        let match = true;
        for (let j = 0; j < len; j++) {
            if (buffer[i + j] !== sequence[j]) {
                match = false;
                break;
            }
        }
        if (match) return i;
    }
    return -1;
}

/**
 * Parse BIN file to get event names
 * @param {ArrayBuffer|Uint8Array} buffer 
 * @returns {Object[]} List of {string, hash} objects
 */
export function parseBinFile(buffer) {
    const uint8 = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    const reader = new BinaryReader(uint8);
    const result = [];
    const eventHeader = new Uint8Array([0x84, 0xE3, 0xD8, 0x12, 0x80, 0x10]);
    const musicHeader = new Uint8Array([0xD4, 0x4F, 0x9C, 0x9F, 0x83]);

    let offset = 0;

    // Search for 'events' containers
    while (offset < uint8.length) {
        const found = findSequence(uint8, eventHeader, offset);
        if (found === -1) break;

        reader.seek(found + eventHeader.length);
        offset = found + eventHeader.length;

        if (reader.remaining() < 8) break;

        // Skip object size (4 bytes)
        reader.skip(4);

        const amount = reader.readUint32LE();
        console.log(`[BIN Parser] Found event container with ${amount} events`);

        for (let i = 0; i < amount; i++) {
            if (reader.remaining() < 2) break;
            const len = reader.readUint16LE();
            if (reader.remaining() < len) break;

            const strBytes = reader.readBytes(len);
            const str = String.fromCharCode(...strBytes);
            const hash = fnv1Hash(str);

            result.push({ string: str, hash });
        }

        offset = reader.tell();
    }

    offset = 0;
    // Search for 'music' embedded objects
    while (offset < uint8.length) {
        const found = findSequence(uint8, musicHeader, offset);
        if (found === -1) break;

        reader.seek(found + musicHeader.length);
        offset = found + musicHeader.length;

        if (reader.remaining() < 4) break;

        const typeHash = reader.readUint32LE();
        if (typeHash === 0) continue;

        if (reader.remaining() < 6) break;

        // Skip object size (4 bytes)
        reader.skip(4);

        const amount = reader.readUint16LE();
        console.log(`[BIN Parser] Found music container with ${amount} objects`);

        for (let i = 0; i < amount; i++) {
            if (reader.remaining() < 5) break;

            // Skip name hash (4 bytes)
            reader.skip(4);

            const binType = reader.readUint8();
            if (binType !== 0x10) { // must be string
                // If not string, we might need to break or skip differently?
                // bin.c says "goto error", so we assume strict format
                console.warn('[BIN Parser] Unexpected bin type:', binType);
                break;
            }

            const len = reader.readUint16LE();
            if (reader.remaining() < len) break;

            const strBytes = reader.readBytes(len);
            const str = String.fromCharCode(...strBytes);
            const hash = fnv1Hash(str);

            result.push({ string: str, hash });
        }

        offset = reader.tell();
    }

    console.log(`[BIN Parser] Parsed ${result.length} strings`);
    return result;
}

/**
 * Helper to get BNK version
 */
function getBnkVersion(reader) {
    const pos = reader.tell();
    reader.seek(0);
    const magic = reader.readString(4);
    if (magic !== 'BKHD') {
        reader.seek(pos);
        return 0;
    }
    const bkhdLen = reader.readUint32LE();
    const version = reader.readUint32LE();
    reader.seek(pos);
    return version;
}

/* Helper functions for HIRC parsing */

function skipInitialFxParams(reader, version) {
    reader.skip(1);
    const numFx = reader.readUint8();
    if (numFx > 0) reader.skip(1);
    reader.skip(numFx * (version <= 0x91 ? 7 : 6));
}

function skipInitialParams(reader) {
    const propCount = reader.readUint8();
    reader.skip(5 * propCount);
    const propCount2 = reader.readUint8();
    reader.skip(9 * propCount2);
}

function skipPositioningParams(reader, version) {
    const positioningBits = reader.readUint8();
    const hasPositioning = positioningBits & 1;
    let has3d = false;
    let hasAutomation = false;

    if (hasPositioning) {
        if (version <= 0x59) {
            const has2d = reader.readUint8();
            has3d = reader.readUint8();
            if (has2d) reader.skip(1);
        } else {
            has3d = (positioningBits & 0x2) !== 0;
        }
    }

    if (hasPositioning && has3d) {
        if (version <= 0x59) {
            hasAutomation = (reader.readUint8() & 3) !== 1;
            reader.skip(8);
        } else {
            hasAutomation = (positioningBits >> 5) & 3;
            reader.skip(1);
        }
    }

    if (hasAutomation) {
        reader.skip(version <= 0x59 ? 9 : 5);
        const numVertices = reader.readUint32LE();
        reader.skip(16 * numVertices);
        const numPlaylistItems = reader.readUint32LE();
        reader.skip((version <= 0x59 ? 16 : 20) * numPlaylistItems);
    } else if (version <= 0x59) {
        reader.skip(1);
    }
}

function skipAuxParams(reader, version) {
    const hasAux = (reader.readUint8() >> 3) & 1;
    if (hasAux) reader.skip(4 * 4);
    if (version > 0x87) reader.skip(4);
}

function skipStateChunk(reader) {
    const stateProps = reader.readUint8();
    reader.skip(3 * stateProps);
    const stateGroups = reader.readUint8();
    for (let i = 0; i < stateGroups; i++) {
        reader.skip(5);
        const states = reader.readUint8();
        reader.skip(8 * states);
    }
}

function skipRtpc(reader, version) {
    const numRtpc = reader.readUint16LE();
    for (let i = 0; i < numRtpc; i++) {
        reader.skip(version <= 0x59 ? 13 : 12);
        const pointCount = reader.readUint16LE();
        reader.skip(12 * pointCount);
    }
}

function skipBaseParams(reader, version, outBusId = null) {
    skipInitialFxParams(reader, version);
    if (version > 0x88) {
        reader.skip(1);
        const numFx = reader.readUint8();
        reader.skip(6 * numFx);
    }

    if (version > 0x59 && version <= 0x91) reader.skip(1);
    const busId = reader.readUint32LE();
    if (outBusId) outBusId.val = busId;

    const parentId = reader.readUint32LE();
    reader.skip(version <= 0x59 ? 2 : 1);

    skipInitialParams(reader);
    skipPositioningParams(reader, version);
    skipAuxParams(reader, version);

    reader.skip(6);

    skipStateChunk(reader);
    skipRtpc(reader, version);

    return parentId;
}

/* HIRC object readers */

function readSoundObject(reader, version) {
    const selfId = reader.readUint32LE();
    reader.skip(4);
    const isStreamed = reader.readUint8();
    if (version <= 0x59) reader.skip(3);
    if (version <= 0x70) reader.skip(4);
    const fileId = reader.readUint32LE();
    return { selfId, fileId, isStreamed };
}

function readEventActionObject(reader) {
    const selfId = reader.readUint32LE();
    const scope = reader.readUint8();
    const type = reader.readUint8();
    let soundObjectId = 0;
    let switchGroupId = 0;
    let switchStateId = 0;
    let stateGroupId = 0;
    let targetStateId = 0;

    if (type === 25 /* set switch */) {
        reader.skip(5);
        skipInitialParams(reader);
        switchGroupId = reader.readUint32LE();
        switchStateId = reader.readUint32LE();
    } else if (type === 18 /* set state */) {
        reader.skip(5);
        skipInitialParams(reader);
        stateGroupId = reader.readUint32LE();
        targetStateId = reader.readUint32LE();
    } else {
        soundObjectId = reader.readUint32LE();
    }
    return { selfId, scope, type, soundObjectId, switchGroupId, switchStateId, stateGroupId, targetStateId };
}

function readEventObject(reader, version) {
    const selfId = reader.readUint32LE();
    const eventAmount = reader.readUint8();
    if (version === 0x58) reader.skip(3);
    const eventIds = [];
    for (let i = 0; i < eventAmount; i++) {
        eventIds.push(reader.readUint32LE());
    }
    return { selfId, eventAmount, eventIds };
}

function readRandomContainerObject(reader, version) {
    const selfId = reader.readUint32LE();
    const switchContainerId = skipBaseParams(reader, version);
    reader.skip(24);
    const soundIdAmount = reader.readUint32LE();
    const soundIds = [];
    for (let i = 0; i < soundIdAmount; i++) {
        soundIds.push(reader.readUint32LE());
    }
    return { selfId, switchContainerId, soundIds };
}

function readSwitchContainerObject(reader, version) {
    const selfId = reader.readUint32LE();
    const parentId = skipBaseParams(reader, version);
    const groupType = reader.readUint8();
    if (version <= 0x59) reader.skip(3);
    const groupId = reader.readUint32LE();
    reader.skip(5);
    const numChildren = reader.readUint32LE();
    const children = [];
    for (let i = 0; i < numChildren; i++) {
        children.push(reader.readUint32LE());
    }
    return { selfId, parentId, groupType, groupId, children };
}

function readMusicContainerObject(reader, version) {
    const selfId = reader.readUint32LE();
    reader.skip(1);
    const busIdPtr = { val: 0 };
    const soundObjectId = skipBaseParams(reader, version, busIdPtr);
    const musicTrackIdAmount = reader.readUint32LE();
    const musicTrackIds = [];
    for (let i = 0; i < musicTrackIdAmount; i++) {
        musicTrackIds.push(reader.readUint32LE());
    }
    return { selfId, soundObjectId, musicSwitchId: busIdPtr.val, musicTrackIdAmount, musicTrackIds };
}

function readMusicTrackObject(reader, version) {
    const selfId = reader.readUint32LE();
    reader.skip(1);
    let count = reader.readUint32LE();
    reader.skip(14 * count);
    count = reader.readUint32LE();

    const start = reader.tell();
    // skip source info
    reader.skip(count * 44);
    const trackCount = reader.readUint32LE();
    reader.seek(start);

    const fileIds = new Array(trackCount).fill(0);
    for (let i = 0; i < count; i++) {
        const trackIndex = reader.readUint32LE();
        const fileId = reader.readUint32LE();
        reader.skip(4); // eventId
        reader.skip(32); // doubles
        if (trackIndex < trackCount) {
            fileIds[trackIndex] = fileId;
        }
    }

    reader.readUint32LE(); // trackCount again
    // skip_clip_automation
    const numClipAutomation = reader.readUint32LE();
    for (let i = 0; i < numClipAutomation; i++) {
        reader.skip(8);
        const pointCount = reader.readUint32LE();
        reader.skip(12 * pointCount);
    }

    const parentId = skipBaseParams(reader, version);
    const trackType = reader.readUint8();
    const hasSwitchIds = trackType === 0x3;
    let switchGroupId = 0;
    const switchIds = [];
    if (hasSwitchIds) {
        reader.skip(1);
        switchGroupId = reader.readUint32LE();
        reader.skip(4); // default switch id
        const count2 = reader.readUint32LE();
        for (let i = 0; i < count2; i++) {
            switchIds.push(reader.readUint32LE());
        }
    }

    return { selfId, trackCount, fileIds, hasSwitchIds, switchGroupId, switchIds, parentId };
}

function readMusicSwitchObject(reader, version) {
    const selfId = reader.readUint32LE();
    reader.skip(1);
    const parentId = skipBaseParams(reader, version);
    const numChildren = reader.readUint32LE();
    const children = [];
    for (let i = 0; i < numChildren; i++) {
        children.push(reader.readUint32LE());
    }
    reader.skip(23);
    const numStingers = reader.readUint32LE();
    reader.skip(24 * numStingers);
    const numRules = reader.readUint32LE();
    for (let i = 0; i < numRules; i++) {
        const numSources = reader.readUint32LE();
        reader.skip(4 * numSources);
        const numDestinations = reader.readUint32LE();
        reader.skip(4 * numDestinations);
        reader.skip(version <= 0x84 ? 45 : 47);
        const hasTransObject = reader.readUint8();
        if (hasTransObject) reader.skip(30);
    }
    reader.skip(1);
    const numArguments = reader.readUint32LE();
    const args = [];
    for (let i = 0; i < numArguments; i++) {
        args.push({ groupId: reader.readUint32LE() });
    }
    for (let i = 0; i < numArguments; i++) {
        args[i].groupType = reader.readUint8();
    }
    const treeSize = reader.readUint32LE();
    reader.skip(1);
    const numNodes = Math.floor(treeSize / 12);
    const nodes = [];
    for (let i = 0; i < numNodes; i++) {
        nodes.push({
            key: reader.readUint32LE(),
            audioId: reader.readUint32LE()
        });
        reader.skip(4);
    }
    return { selfId, parentId, numChildren, children, numArguments, arguments: args, numNodes, nodes };
}

/**
 * Parse HIRC section to get all Wwise objects
 */
export function parseHirc(buffer) {
    const reader = new BinaryReader(buffer);
    const version = getBnkVersion(reader);
    if (!version) return null;

    const sectionLen = skipToSection(reader, 'HIRC', true);
    if (!sectionLen) return null;

    const initialPos = reader.tell();
    const numObjects = reader.readUint32LE();
    const sections = {
        sounds: [],
        eventActions: [],
        events: [],
        randomContainers: [],
        switchContainers: [],
        musicSegments: [],
        musicTracks: [],
        musicSwitches: [],
        musicPlaylists: []
    };

    let objectsRead = 0;
    while (reader.tell() < initialPos + sectionLen) {
        const type = reader.readUint8();
        const length = reader.readUint32LE();
        const start = reader.tell();

        switch (type) {
            case 2: sections.sounds.push(readSoundObject(reader, version)); break;
            case 3: sections.eventActions.push(readEventActionObject(reader)); break;
            case 4: sections.events.push(readEventObject(reader, version)); break;
            case 5: sections.randomContainers.push(readRandomContainerObject(reader, version)); break;
            case 6: sections.switchContainers.push(readSwitchContainerObject(reader, version)); break;
            case 10: sections.musicSegments.push(readMusicContainerObject(reader, version)); break;
            case 11: sections.musicTracks.push(readMusicTrackObject(reader, version)); break;
            case 12: sections.musicSwitches.push(readMusicSwitchObject(reader, version)); break;
            case 13: sections.musicPlaylists.push(readMusicContainerObject(reader, version)); break;
        }

        reader.seek(start + length);
        objectsRead++;
    }

    console.log(`[BNK Parser] Read ${objectsRead}/${numObjects} HIRC objects`);
    return sections;
}

function addConnectedFiles(string, id, parentId, sections, resultHashes) {
    // Music Switch
    const musicSwitch = sections.musicSwitches.find(obj => obj.selfId === id);
    if (musicSwitch) {
        for (const childId of musicSwitch.children) {
            addConnectedFiles(string, childId, id, sections, resultHashes);
        }
        return;
    }

    // Music Playlist (Container)
    const musicPlaylist = sections.musicPlaylists.find(obj => obj.selfId === id);
    if (musicPlaylist) {
        for (const trackId of musicPlaylist.musicTrackIds) {
            addConnectedFiles(string, trackId, musicPlaylist.musicTrackIdAmount > 1 ? id : parentId, sections, resultHashes);
        }
        return;
    }

    // Random Container
    const randomContainer = sections.randomContainers.find(obj => obj.selfId === id);
    if (randomContainer) {
        for (const soundId of randomContainer.soundIds) {
            addConnectedFiles(string, soundId, randomContainer.soundIds.length > 1 ? id : parentId, sections, resultHashes);
        }
        return;
    }

    // Switch Container
    const switchContainer = sections.switchContainers.find(obj => obj.selfId === id);
    if (switchContainer) {
        for (const childId of switchContainer.children) {
            addConnectedFiles(string, childId, id, sections, resultHashes);
        }
        return;
    }

    // Music Segment
    const musicSegment = sections.musicSegments.find(obj => obj.selfId === id);
    if (musicSegment) {
        for (const trackId of musicSegment.musicTrackIds) {
            const musicTrack = sections.musicTracks.find(obj => obj.selfId === trackId);
            if (musicTrack) {
                for (const fileId of musicTrack.fileIds) {
                    if (fileId === 0) continue;
                    resultHashes.push({
                        string,
                        hash: fileId,
                        containerId: parentId,
                        musicSegmentId: musicSegment.musicTrackIdAmount > 1 ? musicSegment.selfId : 0
                    });
                }
            }
        }
        return;
    }

    // Sound
    const sound = sections.sounds.find(obj => obj.selfId === id);
    if (sound) {
        resultHashes.push({
            string,
            hash: sound.fileId,
            containerId: parentId
        });
        return;
    }
}

/**
 * Map event names from BIN to WEM IDs using the HIRC section from BNK
 */
export function getEventMappings(binStrings, eventBnkBuffer) {
    const sections = parseHirc(eventBnkBuffer);
    if (!sections) return [];

    const stringFiles = [];

    for (const binEntry of binStrings) {
        const hash = binEntry.hash;
        const event = sections.events.find(e => e.selfId === hash);
        if (!event) continue;

        for (const actionId of event.eventIds) {
            const action = sections.eventActions.find(a => a.selfId === actionId);
            if (!action) continue;

            if (action.type === 4 /* play */) {
                addConnectedFiles(binEntry.string, action.soundObjectId, 0, sections, stringFiles);
            } else if (action.type === 25 /* set switch */) {
                for (const musicTrack of sections.musicTracks) {
                    if (musicTrack.hasSwitchIds && musicTrack.switchGroupId === action.switchGroupId) {
                        for (let l = 0; l < musicTrack.trackCount; l++) {
                            if (musicTrack.switchIds[l] === action.switchStateId) {
                                if (musicTrack.fileIds[l] !== 0) {
                                    stringFiles.push({
                                        string: binEntry.string,
                                        hash: musicTrack.fileIds[l],
                                        switchId: musicTrack.switchGroupId
                                    });
                                }
                            }
                        }
                    }
                }
            } else if (action.type === 18 /* set state */) {
                for (const musicSwitch of sections.musicSwitches) {
                    for (const arg of musicSwitch.arguments) {
                        if (arg.groupType === 1 /* state */ && arg.groupId === action.stateGroupId) {
                            for (const node of musicSwitch.nodes) {
                                if (node.key === action.targetStateId) {
                                    addConnectedFiles(binEntry.string, node.audioId, musicSwitch.selfId, sections, stringFiles);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    console.log(`[Event Mapper] Mapped ${stringFiles.length} event occurrences to WEM files`);
    return stringFiles;
}

/**
 * FNV-1 hash function (used for event name hashing in Wwise)
 * @param {string} input - String to hash
 * @returns {number} 32-bit hash value
 */
export function fnv1Hash(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash = Math.imul(hash, 0x01000193) >>> 0;
        let c = input.charCodeAt(i);
        // Convert uppercase to lowercase (A-Z -> a-z)
        if (c > 64 && c < 91) c += 32;
        hash ^= c;
        hash = hash >>> 0; // Keep as unsigned 32-bit
    }
    return hash;
}

/**
 * Group audio files into a tree structure based on event names
 * @param {AudioData[]} audioFiles - List of audio files
 * @param {Object[]} stringHashes - List of {string, hash} pairs from bin file
 * @returns {AudioNode} Root node of the tree
 */
export function groupAudioFiles(audioFiles, stringHashes = [], rootName = 'root') {
    const root = new AudioNode(rootName);

    for (const audio of audioFiles) {
        let inserted = false;

        // Try to find matching event names (mappings)
        for (const sh of stringHashes) {
            if (sh.hash === audio.id) {
                // Found a match - navigate through structure
                let currentRoot = root;

                // 1. Switch ID (if any)
                if (sh.switchId) {
                    currentRoot = currentRoot.getOrCreateChild(sh.switchId.toString());
                }

                // 2. Event Name
                currentRoot = currentRoot.getOrCreateChild(sh.string);

                // 3. Container ID (if any)
                if (sh.containerId) {
                    currentRoot = currentRoot.getOrCreateChild(sh.containerId.toString());
                }

                // 4. Music Segment ID (if any)
                if (sh.musicSegmentId) {
                    currentRoot = currentRoot.getOrCreateChild(sh.musicSegmentId.toString());
                }

                // 5. Add WEM file
                currentRoot.addChild(new AudioNode(`${audio.id}.wem`, audio));
                inserted = true;
            }
        }

        // If no match found, add directly to root
        if (!inserted) {
            root.addChild(new AudioNode(`${audio.id}.wem`, audio));
        }
    }

    return root;
}

/**
 * Write BNK file from audio data
 * @param {AudioData[]} audioFiles - Audio files to include
 * @returns {Uint8Array} The complete BNK file data
 */
export function writeBnkFile(audioFiles) {
    const clamp = 16;
    const version = 0x86; // Default version
    const bkhdSectionLength = 0x14;

    // Calculate sizes
    const didxSize = audioFiles.length * 12;
    let dataSize = 0;
    const offsets = [];

    for (let i = 0; i < audioFiles.length; i++) {
        const paddingNeeded = (clamp - (dataSize % clamp)) % clamp;
        offsets.push(dataSize + paddingNeeded);
        dataSize = offsets[i] + audioFiles[i].length;
    }

    // Total size: BKHD + DIDX header (8) + DIDX data + DATA header (8) + data
    const totalSize = 8 + bkhdSectionLength + 8 + didxSize + 8 + dataSize;
    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);
    let pos = 0;

    // Write BKHD section
    output.set([0x42, 0x4B, 0x48, 0x44], pos); pos += 4; // "BKHD"
    view.setUint32(pos, bkhdSectionLength, true); pos += 4;
    view.setUint32(pos, version, true); pos += 4;
    view.setUint32(pos, 0, true); pos += 4; // ID placeholder
    view.setUint32(pos, 0x17705D3E, true); pos += 4; // Random hardcoded bytes
    pos += bkhdSectionLength - 12; // Skip rest

    // Write DIDX section
    output.set([0x44, 0x49, 0x44, 0x58], pos); pos += 4; // "DIDX"
    view.setUint32(pos, didxSize, true); pos += 4;

    for (let i = 0; i < audioFiles.length; i++) {
        view.setUint32(pos, audioFiles[i].id, true); pos += 4;
        view.setUint32(pos, offsets[i], true); pos += 4;
        view.setUint32(pos, audioFiles[i].length, true); pos += 4;
    }

    // Write DATA section
    output.set([0x44, 0x41, 0x54, 0x41], pos); pos += 4; // "DATA"
    view.setUint32(pos, dataSize, true); pos += 4;

    const dataStart = pos;
    for (let i = 0; i < audioFiles.length; i++) {
        output.set(audioFiles[i].data, dataStart + offsets[i]);
    }

    return output;
}

/**
 * Write WPK file from audio data
 * @param {AudioData[]} audioFiles - Audio files to include
 * @returns {Uint8Array} The complete WPK file data
 */
export function writeWpkFile(audioFiles) {
    const clamp = 8;

    // Calculate header size
    const headerSize = 12 + audioFiles.length * 4; // magic + version + count + offsets
    const alignedHeaderSize = headerSize + (clamp - (headerSize % clamp)) % clamp;

    // Calculate entry info positions
    const entryInfos = [];
    let currentPos = alignedHeaderSize;

    for (const audio of audioFiles) {
        const filename = `${audio.id}.wem`;
        const entrySize = 12 + filename.length * 2; // offset + length + filenameLen + wide chars
        const alignedSize = entrySize + (clamp - (entrySize % clamp)) % clamp;
        entryInfos.push({ pos: currentPos, size: alignedSize, filename });
        currentPos += alignedSize;
    }

    // Calculate data positions
    const dataOffsets = [];
    for (let i = 0; i < audioFiles.length; i++) {
        dataOffsets.push(currentPos);
        currentPos += audioFiles[i].length;
        currentPos += (clamp - (currentPos % clamp)) % clamp;
    }

    const totalSize = currentPos;
    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);
    let pos = 0;

    // Write header
    output.set([0x72, 0x33, 0x64, 0x32], pos); pos += 4; // "r3d2"
    view.setUint32(pos, 1, true); pos += 4; // version
    view.setUint32(pos, audioFiles.length, true); pos += 4;

    // Write offset table
    for (const entry of entryInfos) {
        view.setUint32(pos, entry.pos, true); pos += 4;
    }

    // Write entry infos
    for (let i = 0; i < audioFiles.length; i++) {
        pos = entryInfos[i].pos;
        view.setUint32(pos, dataOffsets[i], true); pos += 4;
        view.setUint32(pos, audioFiles[i].length, true); pos += 4;
        view.setUint32(pos, entryInfos[i].filename.length, true); pos += 4;

        // Write wide string filename
        for (const char of entryInfos[i].filename) {
            view.setUint8(pos++, char.charCodeAt(0));
            view.setUint8(pos++, 0);
        }
    }

    // Write audio data
    for (let i = 0; i < audioFiles.length; i++) {
        output.set(audioFiles[i].data, dataOffsets[i]);
    }

    return output;
}

export { AudioData, AudioNode, BinaryReader };
