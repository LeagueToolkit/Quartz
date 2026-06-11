// ConditionFloatClipData parser/generator. Ported from conditionFloatClipParser.js.
// The main animationParser inlines pair parsing; this module provides the
// standalone helpers (content generation, display name, type guard).

import type { Clip, ConditionFloatPair } from '../types';

export function generateConditionFloatClipData(clip: Clip): string {
    let content = `    "${clip.name}" = ConditionFloatClipData {\n`;

    if (clip.flags !== null) content += `        mFlags: u32 = ${clip.flags}\n`;
    if (clip.trackDataName) {
        const trackName = clip.trackDataName.startsWith('0x') ? clip.trackDataName : `"${clip.trackDataName}"`;
        content += `        mTrackDataName: hash = ${trackName}\n`;
    }
    if (clip.animationFilePath) content += `        mAnimationFilePath: string = "${clip.animationFilePath}"\n`;
    if (clip.maskDataName) {
        const maskName = clip.maskDataName.startsWith('0x') ? clip.maskDataName : `"${clip.maskDataName}"`;
        content += `        mMaskDataName: hash = ${maskName}\n`;
    }

    if (clip.changeAnimationMidPlay !== null) content += `        mChangeAnimationMidPlay: bool = ${clip.changeAnimationMidPlay}\n`;
    if (clip.childAnimDelaySwitchTime !== null) content += `        mChildAnimDelaySwitchTime: f32 = ${clip.childAnimDelaySwitchTime}\n`;
    if (clip.dontStompTransitionClip !== null) content += `        mDontStompTransitionClip: bool = ${clip.dontStompTransitionClip}\n`;
    if (clip.playAnimChangeFromBeginning !== null) content += `        mPlayAnimChangeFromBeginning: bool = ${clip.playAnimChangeFromBeginning}\n`;
    if (clip.syncFrameOnChangeAnim !== null) content += `        mSyncFrameOnChangeAnim: bool = ${clip.syncFrameOnChangeAnim}\n`;

    if (clip.conditionFloatPairs && clip.conditionFloatPairs.length > 0) {
        content += `        mConditionFloatPairDataList: list[embed] = {\n`;
        clip.conditionFloatPairs.forEach((pair: ConditionFloatPair, index: number) => {
            content += `            ConditionFloatPairData {\n`;
            if (pair.clipName) {
                const clipName = pair.clipName.startsWith('0x') ? pair.clipName : `"${pair.clipName}"`;
                content += `                mClipName: hash = ${clipName}\n`;
            }
            if (pair.value !== null) content += `                mValue: f32 = ${pair.value}\n`;
            content += `            }`;
            if (index < clip.conditionFloatPairs.length - 1) content += `\n`;
        });
        content += `\n        }\n`;
    }

    if (clip.updater) {
        content += `        Updater: pointer = ${clip.updater.type} {\n`;
        Object.entries(clip.updater.properties).forEach(([propName, propData]) => {
            content += `            ${propName}: ${propData.type} = ${propData.value}\n`;
        });
        content += `        }\n`;
    }

    content += `    }`;
    return content;
}

export function getConditionFloatClipDisplayName(clip: Clip): string {
    if (clip.animationFilePath) return clip.animationFilePath.split('/').pop()!.replace('.anm', '');
    return clip.name;
}

export function isConditionFloatClipData(clip: Clip | null | undefined): boolean {
    return !!clip && clip.type === 'ConditionFloatClipData';
}
