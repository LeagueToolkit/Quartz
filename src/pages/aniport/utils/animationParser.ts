// Animation Parser - Parse animation bin (ritobin text) for AniPort.
// Handles AtomicClipData, ParticleEventData, SoundEventData, SubmeshVisibilityEventData,
// ConformToPathEventData, FaceTargetEventData, SequencerClipData, SelectorClipData,
// ParametricClipData, ConditionFloatClipData.

import type {
    AnimationData,
    Clip,
    ClipType,
    EventTypeCounts,
    ParticleEvent,
    SoundEvent,
    SubmeshEvent,
    FaceTargetEvent,
    ConformToPathEvent,
    ConditionFloatPair,
    SelectorPair,
    ParametricPair,
} from './types';

export function parseAnimationData(content: string): AnimationData {
    const lines = content.split('\n');
    const animationData: AnimationData = {
        clips: {},
        metadata: {},
        totalClips: 0,
        maskNames: [],
        trackNames: [],
        eventTypes: {
            particle: 0,
            sound: 0,
            submesh: 0,
            facetarget: 0,
            conformToPath: 0,
            sequencer: 0,
            conditionFloat: 0,
        },
    };

    let currentClip: Clip | null = null;
    let bracketDepth = 0;
    let inClip = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (
            trimmedLine.includes('= AtomicClipData {') ||
            trimmedLine.includes('= SequencerClipData {') ||
            trimmedLine.includes('= SelectorClipData {') ||
            trimmedLine.includes('= ParametricClipData {') ||
            trimmedLine.includes('= ConditionFloatClipData {')
        ) {
            const quotedNameMatch = line.match(
                /^\s*"([^"]+)"\s*=\s*(AtomicClipData|SequencerClipData|SelectorClipData|ParametricClipData|ConditionFloatClipData)\s*\{/,
            );
            const hashNameMatch = line.match(
                /^\s*(0x[0-9a-fA-F]+)\s*=\s*(AtomicClipData|SequencerClipData|SelectorClipData|ParametricClipData|ConditionFloatClipData)\s*\{/,
            );

            let clipName: string | undefined;
            let clipType: string | undefined;
            if (quotedNameMatch) {
                clipName = quotedNameMatch[1];
                clipType = quotedNameMatch[2];
            } else if (hashNameMatch) {
                clipName = hashNameMatch[1];
                clipType = hashNameMatch[2];
            }

            if (clipName && clipType) {
                currentClip = {
                    name: clipName,
                    type: clipType as ClipType,
                    startLine: i,
                    endLine: null,
                    flags: null,
                    trackDataName: null,
                    animationFilePath: null,
                    maskDataName: null,
                    events: {
                        particle: [],
                        sound: [],
                        submesh: [],
                        conformToPath: [],
                    },
                    clipNameList: [],
                    selectorPairs: [],
                    parametricPairs: [],
                    conditionFloatPairs: [],
                    updater: null,
                    changeAnimationMidPlay: null,
                    childAnimDelaySwitchTime: null,
                    dontStompTransitionClip: null,
                    playAnimChangeFromBeginning: null,
                    syncFrameOnChangeAnim: null,
                    rawContent: '',
                };

                inClip = true;
                bracketDepth = 1;
                animationData.totalClips++;
                // Avoid counting braces on the same line we opened the clip;
                // proceed to the next line.
                continue;
            }
        }

        if (inClip && currentClip) {
            const openBrackets = (line.match(/{/g) || []).length;
            const closeBrackets = (line.match(/}/g) || []).length;
            bracketDepth += openBrackets - closeBrackets;

            parseClipProperties(line, currentClip);
            parseEventData(lines, i, currentClip, animationData.eventTypes);
            parseSelectorPairData(lines, i, currentClip);
            parseParametricPairData(lines, i, currentClip);

            if (bracketDepth <= 0) {
                currentClip.endLine = i;
                currentClip.rawContent = lines.slice(currentClip.startLine, i + 1).join('\n');
                animationData.clips[currentClip.name] = currentClip;

                inClip = false;
                currentClip = null;
                bracketDepth = 0;
            }
        }
    }

    animationData.maskNames = extractMapNames(content, 'mMaskDataMap: map[hash,embed] = {', 'MaskData');
    animationData.trackNames = extractMapNames(content, 'mTrackDataMap: map[hash,embed] = {', 'TrackData');

    return animationData;
}

function extractMapNames(fullText: string, key: string, structName: string): string[] {
    try {
        const keyIdx = fullText.indexOf(key);
        if (keyIdx === -1) return [];
        const openIdx = fullText.indexOf('{', keyIdx);
        if (openIdx === -1) return [];
        let depth = 1;
        let i = openIdx + 1;
        while (i < fullText.length && depth > 0) {
            const ch = fullText[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        if (depth !== 0) return [];
        const closeIdx = i - 1;
        const section = fullText.slice(keyIdx, closeIdx + 1);
        const names = new Set<string>();
        const re = new RegExp(`\\n\\s*("([^"]+)"|(0x[0-9a-fA-F]+))\\s*=\\s*${structName}\\s*\\{`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(section)) !== null) {
            names.add(m[2] || m[3]);
        }
        return Array.from(names);
    } catch {
        return [];
    }
}

function parseClipProperties(line: string, clip: Clip): void {
    const trimmedLine = line.trim();

    const flagsMatch = trimmedLine.match(/mFlags:\s*u32\s*=\s*(\d+)/);
    if (flagsMatch) clip.flags = parseInt(flagsMatch[1]);

    const trackMatch = trimmedLine.match(/mTrackDataName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
    if (trackMatch) {
        let value = trackMatch[1];
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        clip.trackDataName = value;
    }

    const pathMatch = trimmedLine.match(/mAnimationFilePath:\s*string\s*=\s*"([^"]+)"/);
    if (pathMatch) clip.animationFilePath = pathMatch[1];

    const maskMatch = trimmedLine.match(/mMaskDataName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
    if (maskMatch) {
        let value = maskMatch[1];
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        clip.maskDataName = value;
    }

    if (trimmedLine.includes('mClipNameList:') && trimmedLine.includes('{')) {
        clip.clipNameList = [];
    }

    if (
        (/mSelectorPair(Data)?List:\s*list\[embed\]\s*=\s*{/.test(trimmedLine) ||
            trimmedLine.match(/0x[0-9a-fA-F]+\s*:\s*list\[embed\]\s*=\s*{/)) &&
        trimmedLine.includes('{')
    ) {
        clip.selectorPairs = [];
    }

    if (/mParametricPairDataList:\s*list\[embed\]\s*=\s*{/.test(trimmedLine) && trimmedLine.includes('{')) {
        clip.parametricPairs = [];
    }

    if (clip.type === 'ConditionFloatClipData') {
        const changeAnimMatch = trimmedLine.match(/mChangeAnimationMidPlay:\s*bool\s*=\s*(true|false)/);
        if (changeAnimMatch) clip.changeAnimationMidPlay = changeAnimMatch[1] === 'true';

        const delayMatch = trimmedLine.match(/mChildAnimDelaySwitchTime:\s*f32\s*=\s*([0-9.-]+)/);
        if (delayMatch) clip.childAnimDelaySwitchTime = parseFloat(delayMatch[1]);

        const dontStompMatch = trimmedLine.match(/mDontStompTransitionClip:\s*bool\s*=\s*(true|false)/);
        if (dontStompMatch) clip.dontStompTransitionClip = dontStompMatch[1] === 'true';

        const playFromBeginningMatch = trimmedLine.match(/mPlayAnimChangeFromBeginning:\s*bool\s*=\s*(true|false)/);
        if (playFromBeginningMatch) clip.playAnimChangeFromBeginning = playFromBeginningMatch[1] === 'true';

        const syncFrameMatch = trimmedLine.match(/mSyncFrameOnChangeAnim:\s*bool\s*=\s*(true|false)/);
        if (syncFrameMatch) clip.syncFrameOnChangeAnim = syncFrameMatch[1] === 'true';

        if (trimmedLine.includes('mConditionFloatPairDataList:') && trimmedLine.includes('{')) {
            clip.conditionFloatPairs = [];
        }

        if (trimmedLine.includes('Updater:') && trimmedLine.includes('{')) {
            clip.updater = {
                type: 'IFloatParametricUpdater',
                startLine: null,
                endLine: null,
                properties: {},
            };
        }
    }

    const quotedClipNameMatch = line.match(/^\s*"([^"]+)"$/);
    const hashClipNameMatch = line.match(/^\s*(0x[0-9a-fA-F]+)$/);

    if (clip.clipNameList !== undefined) {
        if (quotedClipNameMatch) {
            clip.clipNameList.push({ type: 'quoted', value: quotedClipNameMatch[1], raw: `"${quotedClipNameMatch[1]}"` });
        } else if (hashClipNameMatch) {
            clip.clipNameList.push({ type: 'hash', value: hashClipNameMatch[1], raw: hashClipNameMatch[1] });
        }
    }
}

function parseEventData(lines: string[], lineIndex: number, clip: Clip, eventTypes: EventTypeCounts): void {
    const line = lines[lineIndex].trim();

    if (line.includes('= ParticleEventData {')) {
        const event = parseParticleEvent(lines, lineIndex);
        if (event) {
            clip.events.particle.push(event);
            eventTypes.particle++;
        }
    }

    if (line.includes('ParticleEventDataPair {')) {
        const event = parseParticleEventPair(lines, lineIndex);
        if (event) {
            clip.events.particle.push(event);
            eventTypes.particle++;
        }
    }

    if (line.includes('= SoundEventData {')) {
        const event = parseSoundEvent(lines, lineIndex);
        if (event) {
            clip.events.sound.push(event);
            eventTypes.sound++;
        }
    }

    if (line.includes('= SubmeshVisibilityEventData {')) {
        const event = parseSubmeshEvent(lines, lineIndex);
        if (event) {
            clip.events.submesh.push(event);
            eventTypes.submesh++;
        }
    }

    if (line.includes('= FaceTargetEventData {')) {
        const event = parseFaceTargetEvent(lines, lineIndex);
        if (event) {
            clip.events.facetarget = clip.events.facetarget || [];
            clip.events.facetarget.push(event);
            eventTypes.facetarget = (eventTypes.facetarget || 0) + 1;
        }
    }

    if (line.includes('= ConformToPathEventData {')) {
        const event = parseConformToPathEvent(lines, lineIndex);
        if (event) {
            clip.events.conformToPath.push(event);
            eventTypes.conformToPath++;
        }
    }

    if (line.includes('ConditionFloatPairData {')) {
        const pair = parseConditionFloatPair(lines, lineIndex);
        if (pair && clip.conditionFloatPairs) {
            clip.conditionFloatPairs.push(pair);
            eventTypes.conditionFloat++;
        }
    }
}

export function parseParticleEvent(lines: string[], startLine: number): ParticleEvent | null {
    const definitionLine = lines[startLine].trim();
    const eventNameMatch = definitionLine.match(/^([^=]+)\s*=\s*ParticleEventData\s*{/);
    const eventName = eventNameMatch ? eventNameMatch[1].trim() : null;

    const event: ParticleEvent = {
        type: 'particle',
        eventName,
        hash: eventName,
        startLine,
        endLine: null,
        effectKey: null,
        startFrame: null,
        boneName: null,
        rawContent: '',
    };

    let bracketDepth = 1;
    let endLine = startLine;

    for (let i = startLine + 1; i < lines.length && i < startLine + 100; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;

        const effectKeyMatch = line.match(/mEffectKey:\s*hash\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
        if (effectKeyMatch) event.effectKey = effectKeyMatch[1] || effectKeyMatch[2];

        const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
        if (startFrameMatch) event.startFrame = parseFloat(startFrameMatch[1]);

        const boneNameMatch = line.match(/mBoneName:\s*hash\s*=\s*"([^"]+)"/);
        if (boneNameMatch) event.boneName = boneNameMatch[1];

        if (bracketDepth <= 0) {
            endLine = i;
            break;
        }
    }

    event.endLine = endLine;
    event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
    return event.effectKey ? event : null;
}

export function parseParticleEventPair(lines: string[], startLine: number): ParticleEvent | null {
    const event: ParticleEvent = {
        type: 'particle',
        subtype: 'pair',
        startLine,
        endLine: null,
        effectKey: null,
        startFrame: null,
        boneName: null,
        rawContent: '',
    };

    let bracketDepth = 1;
    let endLine = startLine;

    for (let i = startLine + 1; i < lines.length && i < startLine + 50; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;

        const effectKeyMatch = line.match(/mEffectKey:\s*hash\s*=\s*(?:"([^"]+)"|(0x[0-9a-fA-F]+))/);
        if (effectKeyMatch) event.effectKey = effectKeyMatch[1] || effectKeyMatch[2];

        const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
        if (startFrameMatch) event.startFrame = parseFloat(startFrameMatch[1]);

        const boneNameMatch = line.match(/mBoneName:\s*hash\s*=\s*"([^"]+)"/);
        if (boneNameMatch) event.boneName = boneNameMatch[1];

        if (bracketDepth <= 0) {
            endLine = i;
            break;
        }
    }

    event.endLine = endLine;
    event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
    return event.effectKey ? event : null;
}

export function parseSoundEvent(lines: string[], startLine: number): SoundEvent | null {
    const definitionLine = lines[startLine].trim();
    const eventNameMatch = definitionLine.match(/^([^=]+)\s*=\s*SoundEventData\s*{/);
    const eventName = eventNameMatch ? eventNameMatch[1].trim() : null;

    const event: SoundEvent = {
        type: 'sound',
        eventName,
        hash: eventName,
        startLine,
        endLine: null,
        soundName: null,
        isLoop: false,
        rawContent: '',
    };

    let bracketDepth = 1;
    let endLine = startLine;

    for (let i = startLine + 1; i < lines.length && i < startLine + 20; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;

        const soundNameMatch = line.match(/mSoundName:\s*string\s*=\s*"([^"]+)"/);
        if (soundNameMatch) event.soundName = soundNameMatch[1];

        const isLoopMatch = line.match(/mIsLoop:\s*bool\s*=\s*(true|false)/);
        if (isLoopMatch) event.isLoop = isLoopMatch[1] === 'true';

        if (bracketDepth <= 0) {
            endLine = i;
            break;
        }
    }

    event.endLine = endLine;
    event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
    return event.soundName ? event : null;
}

export function parseSubmeshEvent(lines: string[], startLine: number): SubmeshEvent | null {
    const definitionLine = lines[startLine].trim();
    const eventNameMatch = definitionLine.match(/^([^=]+)\s*=\s*SubmeshVisibilityEventData\s*{/);
    const eventName = eventNameMatch ? eventNameMatch[1].trim() : null;

    const event: SubmeshEvent = {
        type: 'submesh',
        eventName,
        hash: eventName,
        startLine,
        endLine: null,
        startFrame: null,
        endFrame: null,
        fireIfAnimationEndsEarly: false,
        hideSubmeshList: [],
        showSubmeshList: [],
        rawContent: '',
    };

    let bracketDepth = 1;
    let endLine = startLine;
    let inHideList = false;
    let inShowList = false;

    for (let i = startLine + 1; i < lines.length && i < startLine + 50; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;

        const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
        if (startFrameMatch) event.startFrame = parseFloat(startFrameMatch[1]);

        const endFrameMatch = line.match(/mEndFrame:\s*f32\s*=\s*([\d.]+)/);
        if (endFrameMatch) event.endFrame = parseFloat(endFrameMatch[1]);

        const fireEarlyMatch = line.match(/mFireIfAnimationEndsEarly:\s*bool\s*=\s*(true|false)/);
        if (fireEarlyMatch) event.fireIfAnimationEndsEarly = fireEarlyMatch[1] === 'true';

        if (line.includes('mHideSubmeshList:')) {
            inHideList = true;
            inShowList = false;
        } else if (line.includes('mShowSubmeshList:')) {
            inShowList = true;
            inHideList = false;
        }

        const quotedSubmeshMatch = line.match(/^\s*"([^"]+)"$/);
        const unquotedSubmeshMatch = line.match(/^\s*([A-Za-z0-9_]+)$/);

        let submeshName: string | null = null;
        if (quotedSubmeshMatch) submeshName = quotedSubmeshMatch[1];
        else if (unquotedSubmeshMatch) submeshName = unquotedSubmeshMatch[1];

        if (submeshName) {
            if (inHideList) event.hideSubmeshList.push(submeshName);
            else if (inShowList) event.showSubmeshList.push(submeshName);
        }

        if (bracketDepth <= 0) {
            endLine = i;
            break;
        }
    }

    event.endLine = endLine;
    event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
    return event;
}

export function parseFaceTargetEvent(lines: string[], startLine: number): FaceTargetEvent | null {
    const definitionLine = lines[startLine].trim();
    const eventNameMatch = definitionLine.match(/^([^=]+)\s*=\s*FaceTargetEventData\s*{/);
    if (!eventNameMatch) return null;

    const eventName = eventNameMatch[1].trim();
    const event: FaceTargetEvent = {
        type: 'facetarget',
        name: eventName,
        eventName,
        startLine,
        endLine: null,
        startFrame: null,
        endFrame: null,
        faceTarget: null,
        yRotationDegrees: null,
        blendInTime: null,
        blendOutTime: null,
        rawContent: '',
    };

    let bracketDepth = 1;
    let endLine = startLine;

    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('{')) bracketDepth++;
        if (line.includes('}')) bracketDepth--;

        const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([0-9.-]+)/);
        if (startFrameMatch) event.startFrame = parseFloat(startFrameMatch[1]);

        const endFrameMatch = line.match(/mEndFrame:\s*f32\s*=\s*([0-9.-]+)/);
        if (endFrameMatch) event.endFrame = parseFloat(endFrameMatch[1]);

        const faceTargetMatch = line.match(/mFaceTarget:\s*u8\s*=\s*([0-9]+)/);
        if (faceTargetMatch) event.faceTarget = parseInt(faceTargetMatch[1]);

        const yRotationMatch = line.match(/mYRotationDegrees:\s*f32\s*=\s*([0-9.-]+)/);
        if (yRotationMatch) event.yRotationDegrees = parseFloat(yRotationMatch[1]);

        const blendInMatch = line.match(/mBlendInTime:\s*f32\s*=\s*([0-9.-]+)/);
        if (blendInMatch) event.blendInTime = parseFloat(blendInMatch[1]);

        const blendOutMatch = line.match(/mBlendOutTime:\s*f32\s*=\s*([0-9.-]+)/);
        if (blendOutMatch) event.blendOutTime = parseFloat(blendOutMatch[1]);

        if (bracketDepth <= 0) {
            endLine = i;
            break;
        }
    }

    event.endLine = endLine;
    event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
    return event;
}

export function parseConformToPathEvent(lines: string[], startLine: number): ConformToPathEvent | null {
    const event: ConformToPathEvent = {
        type: 'conformToPath',
        startLine,
        endLine: null,
        startFrame: null,
        maskDataName: null,
        blendInTime: null,
        blendOutTime: null,
        rawContent: '',
    };

    let bracketDepth = 1;
    let endLine = startLine;

    for (let i = startLine + 1; i < lines.length && i < startLine + 20; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        bracketDepth += openBrackets - closeBrackets;

        const startFrameMatch = line.match(/mStartFrame:\s*f32\s*=\s*([\d.]+)/);
        if (startFrameMatch) event.startFrame = parseFloat(startFrameMatch[1]);

        const maskMatch = line.match(/mMaskDataName:\s*hash\s*=\s*(0x[0-9a-fA-F]+)/);
        if (maskMatch) event.maskDataName = maskMatch[1];

        const blendInMatch = line.match(/mBlendInTime:\s*f32\s*=\s*([\d.]+)/);
        if (blendInMatch) event.blendInTime = parseFloat(blendInMatch[1]);

        const blendOutMatch = line.match(/mBlendOutTime:\s*f32\s*=\s*([\d.]+)/);
        if (blendOutMatch) event.blendOutTime = parseFloat(blendOutMatch[1]);

        if (bracketDepth <= 0) {
            endLine = i;
            break;
        }
    }

    event.endLine = endLine;
    event.rawContent = lines.slice(startLine, endLine + 1).join('\n');
    return event;
}

function parseConditionFloatPair(lines: string[], startLine: number): ConditionFloatPair | null {
    const pair: ConditionFloatPair = { clipName: null, value: null, startLine, endLine: null };

    let bracketDepth = 1;
    let i = startLine + 1;

    while (i < lines.length && bracketDepth > 0) {
        const line = lines[i].trim();
        for (const char of line) {
            if (char === '{') bracketDepth++;
            if (char === '}') bracketDepth--;
        }

        const clipNameMatch = line.match(/mClipName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
        if (clipNameMatch) {
            let value = clipNameMatch[1];
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            pair.clipName = value;
        }

        const valueMatch = line.match(/mValue:\s*f32\s*=\s*([0-9.-]+)/);
        if (valueMatch) pair.value = parseFloat(valueMatch[1]);

        i++;
    }

    if (bracketDepth === 0) {
        pair.endLine = i - 1;
        return pair;
    }
    return null;
}

export function getAnimationClip(animationData: AnimationData, clipName: string): Clip | null {
    return animationData.clips[clipName] || null;
}

export function getAllEffectKeys(animationData: AnimationData): string[] {
    const effectKeys: string[] = [];
    Object.values(animationData.clips).forEach((clip) => {
        clip.events.particle.forEach((event) => {
            if (event.effectKey && !effectKeys.includes(event.effectKey)) effectKeys.push(event.effectKey);
        });
    });
    return effectKeys;
}

function parseSelectorPairData(lines: string[], lineIndex: number, clip: Clip): void {
    const line = lines[lineIndex].trim();
    if (line.includes('SelectorPairData {')) {
        const pair = parseSelectorPair(lines, lineIndex);
        if (pair && clip.selectorPairs !== undefined) clip.selectorPairs.push(pair);
    }
}

function parseParametricPairData(lines: string[], lineIndex: number, clip: Clip): void {
    const line = lines[lineIndex].trim();
    if (line.includes('ParametricPairData {')) {
        const pair = parseParametricPair(lines, lineIndex);
        if (pair && clip.parametricPairs !== undefined) clip.parametricPairs.push(pair);
    }
}

function parseParametricPair(lines: string[], startIndex: number): ParametricPair | null {
    let braceDepth = 1;
    let clipName: string | null = null;
    let value: number | null = null;

    for (let i = startIndex + 1; i < lines.length && braceDepth > 0; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        braceDepth += openBrackets - closeBrackets;

        const clipNameMatch = line.match(/mClipName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
        if (clipNameMatch) {
            let clipNameValue = clipNameMatch[1];
            if (clipNameValue.startsWith('"') && clipNameValue.endsWith('"')) clipNameValue = clipNameValue.slice(1, -1);
            clipName = clipNameValue;
        }

        const valueMatch = line.match(/mValue:\s*f32\s*=\s*([0-9.-]+)/);
        if (valueMatch) value = parseFloat(valueMatch[1]);
    }

    if (clipName !== null) return { clipName, value };
    return null;
}

function parseSelectorPair(lines: string[], startIndex: number): SelectorPair | null {
    let braceDepth = 1;
    let clipName: string | null = null;
    let probability = 1.0;

    for (let i = startIndex + 1; i < lines.length && braceDepth > 0; i++) {
        const line = lines[i].trim();
        const openBrackets = (line.match(/{/g) || []).length;
        const closeBrackets = (line.match(/}/g) || []).length;
        braceDepth += openBrackets - closeBrackets;

        const clipNameMatch = line.match(/mClipName:\s*hash\s*=\s*("?[^"]*"?|0x[0-9a-fA-F]+)/);
        if (clipNameMatch) {
            let value = clipNameMatch[1];
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            clipName = value;
        }

        const probabilityMatch = line.match(/mProbability:\s*f32\s*=\s*([0-9.]+)/);
        if (probabilityMatch) probability = parseFloat(probabilityMatch[1]);
    }

    if (clipName !== null) return { clipName, probability };
    return null;
}
