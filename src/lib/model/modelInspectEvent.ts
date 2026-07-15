export const OPEN_MODEL_INSPECT_EVENT = 'quartz:open-model-inspect';

export interface OpenModelInspectDetail {
    path: string;
    texturePath?: string | null;
}

/** Open the singleton model inspector from any feature (including DOM-injected
 *  hover previews that do not live in the React tree). */
export function openModelInspect(path: string, texturePath?: string | null): void {
    if (!path) return;
    window.dispatchEvent(new CustomEvent<OpenModelInspectDetail>(OPEN_MODEL_INSPECT_EVENT, {
        detail: { path, texturePath },
    }));
}
