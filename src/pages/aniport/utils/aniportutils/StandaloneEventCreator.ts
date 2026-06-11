// Standalone Event Creator - reusable events that can be dragged to multiple clips.
// Ported from StandaloneEventCreator.js. File-writing helper takes/returns content
// strings (Tauri operates on in-memory ritobin text) instead of touching fs.

import type { AnimEvent, Clip, LoadedAniData, ParticleEvent, SoundEvent, SubmeshEvent, FaceTargetEvent } from '../types';

export interface FaceTargetTouched {
    startFrame?: boolean;
    endFrame?: boolean;
    faceTarget?: boolean;
    yRotationDegrees?: boolean;
    blendInTime?: boolean;
    blendOutTime?: boolean;
}

const randomHash = (): string => `0x${Math.random().toString(16).substr(2, 8)}`;

export function createParticleEvent(
    eventName: string,
    options: { effectKey?: string; startFrame?: number; endFrame?: number; boneName?: string | null; isLoop?: boolean } = {},
): ParticleEvent {
    const { effectKey = eventName, startFrame = 0, endFrame = 0, boneName = null, isLoop = false } = options;
    return {
        type: 'particle',
        name: eventName,
        eventName,
        hash: randomHash(),
        effectKey,
        startFrame,
        endFrame,
        boneName,
        isLoop,
        isStandalone: true,
        startLine: 0,
        endLine: 0,
        rawContent: generateParticleEventContent(eventName, effectKey, startFrame, endFrame, boneName, isLoop),
    };
}

export function createSubmeshEvent(
    eventName: string,
    options: { startFrame?: number; endFrame?: number; showSubmeshList?: string[]; hideSubmeshList?: string[] } = {},
): SubmeshEvent {
    const { startFrame = 0, endFrame = 30, showSubmeshList = [], hideSubmeshList = [] } = options;
    return {
        type: 'submesh',
        name: eventName,
        eventName,
        hash: randomHash(),
        startFrame,
        endFrame,
        fireIfAnimationEndsEarly: false,
        showSubmeshList,
        hideSubmeshList,
        isStandalone: true,
        startLine: 0,
        endLine: 0,
        rawContent: generateSubmeshEventContent(eventName, startFrame, endFrame, showSubmeshList, hideSubmeshList),
    };
}

export function createSoundEvent(
    eventName: string,
    options: { soundName?: string; startFrame?: number; isSelfOnly?: boolean; isLoop?: boolean } = {},
): SoundEvent {
    const { soundName = eventName, startFrame = 0, isSelfOnly = true, isLoop = false } = options;
    return {
        type: 'sound',
        name: eventName,
        eventName,
        hash: randomHash(),
        soundName,
        startFrame,
        isSelfOnly,
        isLoop,
        isStandalone: true,
        startLine: 0,
        endLine: 0,
        rawContent: generateSoundEventContent(eventName, soundName, startFrame, isSelfOnly, isLoop),
    };
}

export function createFaceTargetEvent(
    eventName: string,
    options: {
        startFrame?: number;
        endFrame?: number;
        faceTarget?: number;
        yRotationDegrees?: number;
        blendInTime?: number;
        blendOutTime?: number;
    } = {},
    touched: FaceTargetTouched = {},
): FaceTargetEvent {
    const { startFrame = 0, endFrame = 0, faceTarget = 0, yRotationDegrees = 0.0, blendInTime = 0.0, blendOutTime = 0.0 } = options;
    return {
        type: 'facetarget',
        name: eventName,
        eventName,
        hash: randomHash(),
        startFrame,
        endFrame,
        faceTarget,
        yRotationDegrees,
        blendInTime,
        blendOutTime,
        isStandalone: true,
        startLine: 0,
        endLine: 0,
        rawContent: generateFaceTargetEventContent(eventName, startFrame, endFrame, faceTarget, yRotationDegrees, blendInTime, blendOutTime, touched),
    };
}

function generateParticleEventContent(
    eventName: string,
    effectKey: string,
    startFrame: number,
    endFrame: number,
    boneName: string | null,
    isLoop: boolean,
): string {
    let content = `"${eventName}" = ParticleEventData {\n`;
    content += `    mStartFrame: f32 = ${startFrame}\n`;
    content += `    mEffectKey: hash = "${effectKey}"\n`;
    if (endFrame !== 0) content += `    mEndFrame: f32 = ${endFrame}\n`;
    if (boneName) {
        content += `    mParticleEventDataPairList: list[embed] = {\n`;
        content += `        ParticleEventDataPair {\n`;
        content += `            mBoneName: hash = "${boneName}"\n`;
        content += `        }\n`;
        content += `    }\n`;
    }
    content += `    mIsLoop: bool = ${isLoop}\n`;
    content += `}`;
    return content;
}

function generateSubmeshEventContent(
    eventName: string,
    startFrame: number,
    endFrame: number,
    showSubmeshList: string[],
    hideSubmeshList: string[],
): string {
    let content = `"${eventName}" = SubmeshVisibilityEventData {\n`;
    content += `    mStartFrame: f32 = ${startFrame}\n`;
    if (endFrame !== 0) content += `    mEndFrame: f32 = ${endFrame}\n`;
    if (showSubmeshList.length > 0) {
        content += `    mShowSubmeshList: list[hash] = {\n`;
        showSubmeshList.forEach((submesh) => {
            content += `        "${submesh}"\n`;
        });
        content += `    }\n`;
    }
    if (hideSubmeshList.length > 0) {
        content += `    mHideSubmeshList: list[hash] = {\n`;
        hideSubmeshList.forEach((submesh) => {
            content += `        "${submesh}"\n`;
        });
        content += `    }\n`;
    }
    content += `}`;
    return content;
}

function generateSoundEventContent(
    eventName: string,
    soundName: string,
    startFrame: number,
    isSelfOnly: boolean,
    isLoop: boolean,
): string {
    let content = `"${eventName}" = SoundEventData {\n`;
    content += `    mStartFrame: f32 = ${startFrame}\n`;
    content += `    mSoundName: string = "${soundName}"\n`;
    content += `    mIsSelfOnly: bool = ${isSelfOnly}\n`;
    content += `    mIsLoop: bool = ${isLoop}\n`;
    content += `}`;
    return content;
}

function generateFaceTargetEventContent(
    eventName: string,
    startFrame: number,
    endFrame: number,
    faceTarget: number,
    yRotationDegrees: number,
    blendInTime: number,
    blendOutTime: number,
    touched: FaceTargetTouched = {},
): string {
    let content = `"${eventName}" = FaceTargetEventData {\n`;
    if (touched.startFrame) content += `    mStartFrame: f32 = ${startFrame}\n`;
    if (touched.endFrame && endFrame !== 0) content += `    mEndFrame: f32 = ${endFrame}\n`;
    if (touched.faceTarget) content += `    mFaceTarget: u8 = ${faceTarget}\n`;
    if (touched.yRotationDegrees) content += `    mYRotationDegrees: f32 = ${yRotationDegrees}\n`;
    if (touched.blendInTime) content += `    mBlendInTime: f32 = ${blendInTime}\n`;
    if (touched.blendOutTime) content += `    mBlendOutTime: f32 = ${blendOutTime}\n`;
    content += `}`;
    return content;
}

/* Add a standalone event to the donor data as a virtual clip. */
export function addStandaloneEventToDonor(donorData: LoadedAniData, event: AnimEvent): LoadedAniData {
    if (!donorData || !donorData.animationData) throw new Error('Invalid donor data');

    const virtualClipName = `__STANDALONE_${(event as { name?: string }).name}__`;
    const eventsStructure: Clip['events'] = { particle: [], sound: [], submesh: [], conformToPath: [], facetarget: [] };
    (eventsStructure as Record<string, AnimEvent[]>)[event.type] = [event];

    const virtualClip: Clip = {
        name: virtualClipName,
        type: 'StandaloneEvent',
        startLine: 0,
        endLine: 0,
        flags: null,
        trackDataName: null,
        animationFilePath: null,
        maskDataName: null,
        events: eventsStructure,
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
        rawContent: event.rawContent,
        isStandalone: true,
    };

    return {
        ...donorData,
        animationData: {
            ...donorData.animationData,
            clips: { ...donorData.animationData.clips, [virtualClipName]: virtualClip },
        },
    };
}

export function removeStandaloneEventFromDonor(donorData: LoadedAniData, eventName: string): LoadedAniData {
    if (!donorData || !donorData.animationData) throw new Error('Invalid donor data');
    const virtualClipName = `__STANDALONE_${eventName}__`;
    const updatedClips = { ...donorData.animationData.clips };
    delete updatedClips[virtualClipName];
    return { ...donorData, animationData: { ...donorData.animationData, clips: updatedClips } };
}

export function getStandaloneEvents(donorData: LoadedAniData | null): AnimEvent[] {
    if (!donorData || !donorData.animationData) return [];
    const standaloneEvents: AnimEvent[] = [];
    Object.values(donorData.animationData.clips).forEach((clip) => {
        if (clip.isStandalone && clip.type === 'StandaloneEvent') {
            const eventType = Object.keys(clip.events).find(
                (type) => clip.events[type] && (clip.events[type] as AnimEvent[]).length > 0,
            );
            if (eventType) standaloneEvents.push((clip.events[eventType] as AnimEvent[])[0]);
        }
    });
    return standaloneEvents;
}

/* Add a standalone event to any clip's mEventDataMap, returning the modified content.
   Ported 1:1 from addStandaloneEventToClip but operating on a content string. */
export function addStandaloneEventToClipContent(content: string, clipName: string, event: AnimEvent): string {
    const escaped = clipName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const clipPattern = clipName.startsWith('0x')
        ? new RegExp(`${clipName}\\s*=\\s*(AtomicClipData|SequencerClipData|ParametricClipData|SelectorClipData)\\s*{`)
        : new RegExp(`"${escaped}"\\s*=\\s*(AtomicClipData|SequencerClipData|ParametricClipData|SelectorClipData)\\s*{`);

    const match = content.match(clipPattern);
    if (!match || match.index === undefined) throw new Error(`Clip "${clipName}" not found in file`);

    const clipStartIndex = match.index;
    let braceCount = 0;
    let clipEndIndex = clipStartIndex;
    let inClip = false;
    for (let i = clipStartIndex; i < content.length; i++) {
        const char = content[i];
        if (char === '{') {
            braceCount++;
            inClip = true;
        } else if (char === '}') {
            braceCount--;
            if (inClip && braceCount === 0) {
                clipEndIndex = i;
                break;
            }
        }
    }

    const clipContent = content.substring(clipStartIndex, clipEndIndex + 1);

    const findMapBounds = (text: string): { keyIdx: number; braceOpen: number; braceClose: number } | null => {
        const keyIdx = text.indexOf('mEventDataMap:');
        if (keyIdx === -1) return null;
        const braceOpen = text.indexOf('{', keyIdx);
        if (braceOpen === -1) return null;
        let depth = 1;
        let i = braceOpen + 1;
        while (i < text.length && depth > 0) {
            const ch = text[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        if (depth !== 0) return null;
        return { keyIdx, braceOpen, braceClose: i - 1 };
    };

    const getLineIndent = (text: string, anyIndexWithinLine: number): string => {
        let lineStart = anyIndexWithinLine;
        while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
        let j = lineStart;
        while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
        return text.slice(lineStart, j);
    };

    let modifiedClipContent: string;
    const mapBounds = findMapBounds(clipContent);

    if (mapBounds) {
        const mapLineIndent = getLineIndent(clipContent, mapBounds.keyIdx);
        const entryIndent = mapLineIndent + '    ';
        const indentedEvent = event.rawContent
            .split('\n')
            .map((ln) => entryIndent + ln)
            .join('\n');
        modifiedClipContent =
            clipContent.slice(0, mapBounds.braceClose) +
            '\n' +
            indentedEvent +
            '\n' +
            mapLineIndent +
            '}' +
            clipContent.slice(mapBounds.braceClose + 1);
    } else {
        let insertPos = -1;
        const lines = clipContent.split('\n');
        let cumulativeIndex = 0;
        let braceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            const lineStartIdx = cumulativeIndex;
            cumulativeIndex += line.length + 1;

            for (const char of line) {
                if (char === '{') braceDepth++;
                if (char === '}') braceDepth--;
            }

            if (trimmed === '' || trimmed === '{') continue;

            if (line.includes(':') && braceDepth <= 1) {
                if (trimmed.includes('list[') || trimmed.includes('map[')) {
                    let tempBraceDepth = braceDepth;
                    let j = i + 1;
                    while (j < lines.length && tempBraceDepth > 0) {
                        const nextLine = lines[j];
                        for (const char of nextLine) {
                            if (char === '{') tempBraceDepth++;
                            if (char === '}') tempBraceDepth--;
                        }
                        j++;
                    }
                    if (j > 0) {
                        let tempCumulativeIndex = 0;
                        for (let k = 0; k < j; k++) tempCumulativeIndex += lines[k].length + 1;
                        insertPos = tempCumulativeIndex - 1;
                        break;
                    }
                } else {
                    insertPos = lineStartIdx + line.length;
                    break;
                }
            }
        }

        if (insertPos === -1) insertPos = clipContent.lastIndexOf('}');

        const beforeInsertIndent = getLineIndent(clipContent, Math.max(0, insertPos - 1));
        const mapIndent = beforeInsertIndent + '    ';
        const entryIndent = mapIndent + '    ';
        const indentedEvent = event.rawContent
            .split('\n')
            .map((ln) => entryIndent + ln)
            .join('\n');
        const newMapBlock = `\n${mapIndent}mEventDataMap: map[hash,pointer] = {\n${indentedEvent}\n${mapIndent}}`;
        modifiedClipContent = clipContent.slice(0, insertPos) + newMapBlock + '\n' + clipContent.slice(insertPos);
    }

    return content.substring(0, clipStartIndex) + modifiedClipContent + content.substring(clipEndIndex + 1);
}
