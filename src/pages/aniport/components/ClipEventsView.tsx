// Renders a clip's event-type sections (particle/sound/submesh/facetarget).
// Shared by the donor (draggable) and target (deletable) panels.

import type { DragEvent } from 'react';
import type { Clip, AnimEvent } from '../utils/types';

interface Props {
    clip: Clip;
    side: 'donor' | 'target';
    onDragStart?: (e: DragEvent<HTMLDivElement>, event: AnimEvent, clip: Clip) => void;
    onDeleteEvent?: (event: AnimEvent, clipName: string, eventType: string, index: number) => void;
}

const eventIcon = (eventType: string): string =>
    eventType === 'particle' ? '✨' :
        eventType === 'sound' ? '🔊' :
            eventType === 'submesh' ? '👁️' :
                eventType === 'facetarget' ? '🎯' : '⚡';

function eventDetails(eventType: string, event: AnimEvent): string {
    const e = event as unknown as Record<string, unknown>;
    if (eventType === 'particle') return `Effect: ${e.effectKey || 'None'} | Frame: ${e.startFrame || 0}`;
    if (eventType === 'sound') return `Sound: ${e.soundName || 'None'}`;
    if (eventType === 'submesh') return `End Frame: ${e.endFrame || 0}`;
    if (eventType === 'facetarget') return `Target: ${e.faceTarget || 0} | Y-Rot: ${e.yRotationDegrees || 0}°`;
    return '';
}

export default function ClipEventsView({ clip, side, onDragStart, onDeleteEvent }: Props) {
    return (
        <>
            {Object.entries(clip.events || {}).map(([eventType, events]) =>
                events && events.length > 0 ? (
                    <div key={eventType} className="event-type-section">
                        <div className="event-type-header">
                            <span className="event-type-name">{eventType}</span>
                            <span className="event-type-count">({events.length})</span>
                        </div>

                        {events.map((event, index) => (
                            <div
                                key={`${eventType}-${index}`}
                                className={side === 'donor' ? 'event-item draggable' : 'event-item target-event'}
                                draggable={side === 'donor'}
                                onDragStart={side === 'donor' && onDragStart ? (e) => onDragStart(e, event, clip) : undefined}
                            >
                                <div className="event-content">
                                    <div className="event-header">
                                        <span className="event-icon">{eventIcon(eventType)}</span>
                                        <span className="event-type">{eventType}</span>
                                        {side === 'donor' && <span className="drag-hint">Drag to port →</span>}
                                        {side === 'target' && (event as { isPorted?: boolean }).isPorted && <span className="ported-badge">PORTED</span>}
                                    </div>
                                    <div className="event-details">{eventDetails(eventType, event)}</div>
                                </div>
                                {side === 'target' && onDeleteEvent && (
                                    <div className="event-actions">
                                        <button
                                            className="dl-btn dl-btn--sm dl-btn--icon dl-btn--danger"
                                            onClick={() => onDeleteEvent(event, clip.name, eventType, index)}
                                            title="Delete this event"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : null,
            )}
        </>
    );
}
