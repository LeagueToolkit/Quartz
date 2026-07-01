// Standalone Event Creator UI. Ported 1:1 from StandaloneEventCreatorUI.js.

import { useState } from 'react';
import { Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { Check } from 'lucide-react';
import {
    createParticleEvent,
    createSubmeshEvent,
    createSoundEvent,
    createFaceTargetEvent,
    addStandaloneEventToDonor,
    type FaceTargetTouched,
} from '../utils/aniportutils/StandaloneEventCreator';
import type { AnimEvent, LoadedAniData } from '../utils/types';

interface Props {
    donorData: LoadedAniData | null;
    setDonorData: (data: LoadedAniData) => void;
    createMessage: (opts: { title: string; message: string; type: 'success' | 'error' | 'info' | 'warning' }) => void;
}

export default function StandaloneEventCreatorUI({ donorData, setDonorData, createMessage }: Props) {
    const [newEventType, setNewEventType] = useState<'particle' | 'submesh' | 'sound' | 'facetarget'>('particle');
    const [newEventName, setNewEventName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    const [particleOptions, setParticleOptions] = useState({ effectKey: '', startFrame: 0, endFrame: 0, boneName: '', isLoop: false });
    const [submeshOptions, setSubmeshOptions] = useState<{ startFrame: number; endFrame: number; showSubmeshList: string[]; hideSubmeshList: string[] }>({
        startFrame: 0,
        endFrame: 0,
        showSubmeshList: [],
        hideSubmeshList: [],
    });
    const [soundOptions, setSoundOptions] = useState({ soundName: '', startFrame: 0, isSelfOnly: true, isLoop: false });
    const [faceTargetOptions, setFaceTargetOptions] = useState({ startFrame: 0, endFrame: 0, faceTarget: 0, yRotationDegrees: 0.0, blendInTime: 0.0, blendOutTime: 0.0 });
    const [faceTargetTouched, setFaceTargetTouched] = useState<FaceTargetTouched>({});

    const handleCreateStandaloneEvent = async () => {
        if (!newEventName.trim()) {
            createMessage({ title: 'Invalid Input', message: 'Please enter an event name', type: 'error' });
            return;
        }
        if (!donorData) {
            createMessage({ title: 'No Donor', message: 'Load donor files first.', type: 'error' });
            return;
        }

        setIsCreating(true);
        try {
            let event: AnimEvent;
            switch (newEventType) {
                case 'particle':
                    event = createParticleEvent(newEventName, {
                        effectKey: particleOptions.effectKey || newEventName,
                        startFrame: particleOptions.startFrame,
                        endFrame: particleOptions.endFrame,
                        boneName: particleOptions.boneName || null,
                        isLoop: particleOptions.isLoop,
                    });
                    break;
                case 'submesh':
                    event = createSubmeshEvent(newEventName, {
                        startFrame: submeshOptions.startFrame,
                        endFrame: submeshOptions.endFrame,
                        showSubmeshList: submeshOptions.showSubmeshList,
                        hideSubmeshList: submeshOptions.hideSubmeshList,
                    });
                    break;
                case 'sound':
                    event = createSoundEvent(newEventName, {
                        soundName: soundOptions.soundName || newEventName,
                        startFrame: soundOptions.startFrame,
                        isSelfOnly: soundOptions.isSelfOnly,
                        isLoop: soundOptions.isLoop,
                    });
                    break;
                case 'facetarget':
                    event = createFaceTargetEvent(newEventName, { ...faceTargetOptions }, faceTargetTouched);
                    break;
                default:
                    throw new Error(`Unknown event type: ${newEventType}`);
            }

            setDonorData(addStandaloneEventToDonor(donorData, event));

            setNewEventName('');
            setParticleOptions({ effectKey: '', startFrame: 0, endFrame: 0, boneName: '', isLoop: false });
            setSubmeshOptions({ startFrame: 0, endFrame: 0, showSubmeshList: [], hideSubmeshList: [] });
            setSoundOptions({ soundName: '', startFrame: 0, isSelfOnly: true, isLoop: false });
            setFaceTargetOptions({ startFrame: 0, endFrame: 0, faceTarget: 0, yRotationDegrees: 0.0, blendInTime: 0.0, blendOutTime: 0.0 });
            setFaceTargetTouched({});

            createMessage({ title: 'Event Created', message: `Created standalone ${newEventType} event "${newEventName}"`, type: 'success' });
        } catch (error) {
            createMessage({ title: 'Creation Failed', message: `Failed to create event: ${(error as Error).message}`, type: 'error' });
        } finally {
            setIsCreating(false);
        }
    };

    const renderEventTypeOptions = () => {
        switch (newEventType) {
            case 'particle':
                return (
                    <div className="event-options">
                        <div className="option-row">
                            <label>Effect Key:</label>
                            <input type="text" value={particleOptions.effectKey} onChange={(e) => setParticleOptions((p) => ({ ...p, effectKey: e.target.value }))} placeholder="VFX effect name" className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Start Frame:</label>
                            <input type="number" value={particleOptions.startFrame} onChange={(e) => setParticleOptions((p) => ({ ...p, startFrame: parseInt(e.target.value) || 0 }))} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>End Frame (optional):</label>
                            <input type="number" value={particleOptions.endFrame} onChange={(e) => setParticleOptions((p) => ({ ...p, endFrame: parseInt(e.target.value) || 0 }))} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Bone Name (optional):</label>
                            <input type="text" value={particleOptions.boneName} onChange={(e) => setParticleOptions((p) => ({ ...p, boneName: e.target.value }))} placeholder="Bone attachment point" className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label className="dl-check">
                                <input type="checkbox" checked={particleOptions.isLoop} onChange={(e) => setParticleOptions((p) => ({ ...p, isLoop: e.target.checked }))} />
                                <span className="dl-check__box"><span className="dl-check__tick"><span className="dl-icon"><Check size={12} /></span></span></span>
                                Loop Effect
                            </label>
                        </div>
                    </div>
                );
            case 'submesh':
                return (
                    <div className="event-options">
                        <div className="option-row">
                            <label>Start Frame:</label>
                            <input type="number" value={submeshOptions.startFrame} onChange={(e) => setSubmeshOptions((p) => ({ ...p, startFrame: parseInt(e.target.value) || 0 }))} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>End Frame:</label>
                            <input type="number" value={submeshOptions.endFrame} onChange={(e) => setSubmeshOptions((p) => ({ ...p, endFrame: parseInt(e.target.value) || 30 }))} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Show Submeshes (comma-separated):</label>
                            <input type="text" value={submeshOptions.showSubmeshList.join(', ')} onChange={(e) => setSubmeshOptions((p) => ({ ...p, showSubmeshList: e.target.value.split(',').map((s) => s.trim()).filter((s) => s) }))} placeholder="Weapon, Shield, etc." className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Hide Submeshes (comma-separated):</label>
                            <input type="text" value={submeshOptions.hideSubmeshList.join(', ')} onChange={(e) => setSubmeshOptions((p) => ({ ...p, hideSubmeshList: e.target.value.split(',').map((s) => s.trim()).filter((s) => s) }))} placeholder="Weapon, Shield, etc." className="dl-input option-input" />
                        </div>
                    </div>
                );
            case 'sound':
                return (
                    <div className="event-options">
                        <div className="option-row">
                            <label>Sound Name:</label>
                            <input type="text" value={soundOptions.soundName} onChange={(e) => setSoundOptions((p) => ({ ...p, soundName: e.target.value }))} placeholder="Sound file name" className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Start Frame:</label>
                            <input type="number" value={soundOptions.startFrame} onChange={(e) => setSoundOptions((p) => ({ ...p, startFrame: parseInt(e.target.value) || 0 }))} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label className="dl-check">
                                <input type="checkbox" checked={soundOptions.isSelfOnly} onChange={(e) => setSoundOptions((p) => ({ ...p, isSelfOnly: e.target.checked }))} />
                                <span className="dl-check__box"><span className="dl-check__tick"><span className="dl-icon"><Check size={12} /></span></span></span>
                                Self Only
                            </label>
                        </div>
                        <div className="option-row">
                            <label className="dl-check">
                                <input type="checkbox" checked={soundOptions.isLoop} onChange={(e) => setSoundOptions((p) => ({ ...p, isLoop: e.target.checked }))} />
                                <span className="dl-check__box"><span className="dl-check__tick"><span className="dl-icon"><Check size={12} /></span></span></span>
                                Loop Sound
                            </label>
                        </div>
                    </div>
                );
            case 'facetarget':
                return (
                    <div className="event-options">
                        <div className="option-row">
                            <label>Start Frame:</label>
                            <input type="number" value={faceTargetOptions.startFrame} onChange={(e) => { setFaceTargetOptions((p) => ({ ...p, startFrame: parseInt(e.target.value) || 0 })); setFaceTargetTouched((p) => ({ ...p, startFrame: true })); }} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>End Frame (optional):</label>
                            <input type="number" value={faceTargetOptions.endFrame} onChange={(e) => { setFaceTargetOptions((p) => ({ ...p, endFrame: parseInt(e.target.value) || 0 })); setFaceTargetTouched((p) => ({ ...p, endFrame: true })); }} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Face Target (0-255):</label>
                            <input type="number" min="0" max="255" value={faceTargetOptions.faceTarget} onChange={(e) => { setFaceTargetOptions((p) => ({ ...p, faceTarget: parseInt(e.target.value) || 0 })); setFaceTargetTouched((p) => ({ ...p, faceTarget: true })); }} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Y Rotation Degrees:</label>
                            <input type="number" step="0.1" value={faceTargetOptions.yRotationDegrees} onChange={(e) => { setFaceTargetOptions((p) => ({ ...p, yRotationDegrees: parseFloat(e.target.value) || 0.0 })); setFaceTargetTouched((p) => ({ ...p, yRotationDegrees: true })); }} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Blend In Time:</label>
                            <input type="number" step="0.1" value={faceTargetOptions.blendInTime} onChange={(e) => { setFaceTargetOptions((p) => ({ ...p, blendInTime: parseFloat(e.target.value) || 0.0 })); setFaceTargetTouched((p) => ({ ...p, blendInTime: true })); }} className="dl-input option-input" />
                        </div>
                        <div className="option-row">
                            <label>Blend Out Time:</label>
                            <input type="number" step="0.1" value={faceTargetOptions.blendOutTime} onChange={(e) => { setFaceTargetOptions((p) => ({ ...p, blendOutTime: parseFloat(e.target.value) || 0.0 })); setFaceTargetTouched((p) => ({ ...p, blendOutTime: true })); }} className="dl-input option-input" />
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="standalone-event-creator">
            <h4>Create Standalone Events</h4>
            <p className="creator-description">Create reusable events that can be dragged to multiple target clips</p>

            <div className="create-event-form">
                <div className="form-row">
                    <FormControl sx={{ minWidth: 200 }}>
                        <InputLabel sx={{ color: 'var(--text)', '&.Mui-focused': { color: 'var(--accent)' } }}>Event Type</InputLabel>
                        <Select
                            value={newEventType}
                            label="Event Type"
                            onChange={(e) => setNewEventType(e.target.value as typeof newEventType)}
                            sx={{
                                color: 'var(--text)',
                                backgroundColor: 'var(--glass-bg)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '8px',
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--glass-border)' },
                                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' },
                                '& .MuiSelect-icon': { color: 'var(--text)' },
                            }}
                        >
                            <MenuItem value="particle">ParticleEventData</MenuItem>
                            <MenuItem value="submesh">SubmeshVisibilityEventData</MenuItem>
                            <MenuItem value="sound">SoundEventData</MenuItem>
                            <MenuItem value="facetarget">FaceTargetEventData</MenuItem>
                        </Select>
                    </FormControl>

                    <input type="text" placeholder="Event name (e.g., MyVFX, HideWeapon)" value={newEventName} onChange={(e) => setNewEventName(e.target.value)} className="dl-input event-name-input" />

                    <button className="dl-btn dl-btn--primary create-event-btn" onClick={handleCreateStandaloneEvent} disabled={!newEventName.trim() || isCreating}>
                        {isCreating ? 'Creating...' : '+ Create Event'}
                    </button>
                </div>

                {renderEventTypeOptions()}
            </div>
        </div>
    );
}
