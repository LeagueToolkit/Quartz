export const OPEN_MODEL_INSPECT_EVENT = 'quartz:open-model-inspect';

export interface OpenModelInspectDetail {
    path: string;
    texturePath?: string | null;
    texturePaths?: Record<string, string>;
    hiddenGroups?: string[];
    modelScale?: number;
    /** Companion .anm paths available for this model (enables the animation UI). */
    anmPaths?: string[];
    /** Resolved clips (submesh-visibility events + sequencer queues). */
    anmClips?: import('@/lib/api/modelInspect').PreparedClip[];
    chromaOptions?: ModelInspectChromaOption[];
    selectedChromaId?: number | null;
    onSelectChroma?: (chromaId: number | null) => void | Promise<void>;
}

export interface ModelInspectChromaOption {
    id: number;
    name: string;
    color?: string;
}

/** Open the singleton model inspector from any feature (including DOM-injected
 *  hover previews that do not live in the React tree). */
export function openModelInspect(
    path: string,
    texturePath?: string | null,
    texturePaths?: Record<string, string>,
    hiddenGroups?: string[],
    modelScale?: number,
    chroma?: Pick<OpenModelInspectDetail, 'chromaOptions' | 'selectedChromaId' | 'onSelectChroma'>,
    anmPaths?: string[],
    anmClips?: OpenModelInspectDetail['anmClips'],
): void {
    if (!path) return;
    window.dispatchEvent(new CustomEvent<OpenModelInspectDetail>(OPEN_MODEL_INSPECT_EVENT, {
        detail: { path, texturePath, texturePaths, hiddenGroups, modelScale, anmPaths, anmClips, ...chroma },
    }));
}
