import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Copy, RotateCcw, Pipette, Eye, EyeOff } from 'lucide-react';
import { ColorPickerHost, openColorPicker, cleanupColorPickers } from './paint/components/ColorPicker';
import './rgba/Rgba.css';

type Vec4 = [number, number, number, number];

function vec4ToHex(vec: Vec4): string {
    const r = Math.ceil(Math.max(0, Math.min(1, vec[0])) * 254.9);
    const g = Math.ceil(Math.max(0, Math.min(1, vec[1])) * 254.9);
    const b = Math.ceil(Math.max(0, Math.min(1, vec[2])) * 254.9);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function Rgba() {
    const [vec4, setVec4] = useState<Vec4>([1, 0, 0, 1]);
    const [alphaPercent, setAlphaPercent] = useState(100);
    const [alphaPreview, setAlphaPreview] = useState(1);
    const [showAlpha, setShowAlpha] = useState(true);
    const [rgbaInput, setRgbaInput] = useState('{ 1.000, 0.000, 0.000, 1.000 }');
    const [copied, setCopied] = useState(false);

    const rgbaInputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hexColor = useMemo(() => vec4ToHex(vec4), [vec4]);

    const formatVec4 = useMemo(
        () => `{ ${vec4[0].toFixed(6)}, ${vec4[1].toFixed(6)}, ${vec4[2].toFixed(6)}, ${vec4[3].toFixed(6)} }`,
        [vec4],
    );
    const formatRGBA = useMemo(
        () => `{ ${vec4[0].toFixed(3)}, ${vec4[1].toFixed(3)}, ${vec4[2].toFixed(3)}, ${vec4[3].toFixed(3)} }`,
        [vec4],
    );
    const formatRGB = useMemo(
        () => `{${Math.ceil(vec4[0] * 254.9)}, ${Math.ceil(vec4[1] * 254.9)}, ${Math.ceil(vec4[2] * 254.9)}}`,
        [vec4],
    );

    useEffect(() => {
        setAlphaPercent(Math.round(vec4[3] * 100));
        setAlphaPreview(vec4[3]);
        setRgbaInput(`{ ${vec4[0].toFixed(3)}, ${vec4[1].toFixed(3)}, ${vec4[2].toFixed(3)}, ${vec4[3].toFixed(3)} }`);
    }, [vec4]);

    const parseRgbaInput = useCallback((input: string): Vec4 | null => {
        const clean = input.replace(/[{}]/g, '').replace(/\s/g, '');
        const values = clean.split(',');
        if (values.length === 4) {
            const [r, g, b, a] = values.map((v) => parseFloat(v));
            if ([r, g, b, a].every((n) => !isNaN(n) && n >= 0 && n <= 1)) {
                return [r, g, b, a];
            }
        }
        return null;
    }, []);

    // Picker commits a hex string; keep current alpha.
    const handleHexChange = useCallback((hex: string) => {
        const clean = hex.startsWith('#') ? hex.slice(1) : hex;
        if (/^[0-9a-fA-F]{6}$/.test(clean)) {
            const r = Number('0x' + clean.substring(0, 2)) / 255;
            const g = Number('0x' + clean.substring(2, 4)) / 255;
            const b = Number('0x' + clean.substring(4, 6)) / 255;
            setVec4((prev) => [r, g, b, prev[3]]);
        }
    }, []);

    const handleColorPickerClick = useCallback((event: MouseEvent) => {
        openColorPicker(event, hexColor, handleHexChange);
    }, [hexColor, handleHexChange]);

    const handleRgbaInputChange = useCallback((value: string) => {
        setRgbaInput(value);
        if (rgbaInputTimeoutRef.current) clearTimeout(rgbaInputTimeoutRef.current);
        rgbaInputTimeoutRef.current = setTimeout(() => {
            const parsed = parseRgbaInput(value);
            if (parsed) setVec4(parsed);
        }, 500);
    }, [parseRgbaInput]);

    const handleAlphaCommit = useCallback((value: number) => {
        setVec4((prev) => [prev[0], prev[1], prev[2], Math.max(0, Math.min(1, value))]);
    }, []);

    const handleReset = useCallback(() => setVec4([1, 0, 0, 1]), []);
    const handleCopyVec4 = useCallback(() => {
        navigator.clipboard.writeText(formatVec4).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
        }).catch(() => {});
    }, [formatVec4]);

    useEffect(() => () => {
        if (rgbaInputTimeoutRef.current) clearTimeout(rgbaInputTimeoutRef.current);
        cleanupColorPickers();
    }, []);

    const info = [
        { label: 'Hex Color', value: hexColor },
        { label: 'RGB (0-255)', value: formatRGB },
        { label: 'RGBA (0-1)', value: formatRGBA },
        { label: 'Alpha', value: `${alphaPercent.toFixed(1)}%` },
    ];

    return (
        <div className="rgba-root">
            <ColorPickerHost />

            <div className="rgba-cols">
                {/* Left — Color Selection */}
                <section className="rgba-col">
                    <div className="rgba-head">
                        <Pipette size={18} />
                        <span>Color Selection</span>
                    </div>

                    <div className="rgba-selrow">
                        <button className="rgba-swatch" onClick={handleColorPickerClick} style={{ background: hexColor }} title="Pick a color">
                            <span className="rgba-swatch__badge"><Pipette size={11} /></span>
                        </button>

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="rgba-label">RGBA (0-1)</div>
                            <input
                                className="dl-input"
                                value={rgbaInput}
                                onChange={(e) => handleRgbaInputChange(e.target.value)}
                                placeholder="{ 1.000, 0.000, 0.000, 1.000 }"
                                style={{ fontFamily: 'var(--font-mono)' }}
                            />
                        </div>

                        <button
                            className={`dl-btn dl-btn--icon${showAlpha ? ' dl-btn--active' : ''}`}
                            onClick={() => setShowAlpha((s) => !s)}
                            title={showAlpha ? 'Hide alpha' : 'Show alpha'}
                        >
                            {showAlpha ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                    </div>

                    {showAlpha && (
                        <div className="rgba-alpha">
                            <div className="rgba-label">Alpha: {Math.round(alphaPreview * 100)}% ({alphaPreview.toFixed(3)})</div>
                            <span className="dl-slider" style={{ '--_value': `${alphaPreview * 100}%` } as React.CSSProperties}>
                                <input
                                    type="range" min={0} max={1} step={0.001}
                                    value={alphaPreview}
                                    onChange={(e) => setAlphaPreview(Number(e.target.value))}
                                    onMouseUp={(e) => handleAlphaCommit(Number((e.target as HTMLInputElement).value))}
                                    onKeyUp={(e) => handleAlphaCommit(Number((e.target as HTMLInputElement).value))}
                                />
                            </span>
                        </div>
                    )}

                    <div className="rgba-actions">
                        <button className={`dl-btn ${copied ? 'dl-btn--active' : 'dl-btn--primary'}`} onClick={handleCopyVec4} style={{ flex: 1 }}>
                            <span className="dl-icon"><Copy size={15} /></span>
                            <span>{copied ? 'Copied' : 'Copy Vec4'}</span>
                        </button>
                        <button className="dl-btn dl-btn--secondary" onClick={handleReset} style={{ flex: 1 }}>
                            <span className="dl-icon"><RotateCcw size={15} /></span>
                            <span>Reset</span>
                        </button>
                    </div>
                </section>

                <div className="rgba-divider" />

                {/* Right — Color Information & Preview */}
                <section className="rgba-col">
                    <div className="rgba-head"><span>Color Information</span></div>

                    <div className="rgba-infogrid">
                        {info.map((item) => (
                            <div className="dl-card rgba-infocard" key={item.label}>
                                <div className="rgba-label">{item.label}</div>
                                <div className="rgba-infoval">{item.value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="rgba-head" style={{ marginTop: 4 }}><span>Color Preview</span></div>

                    <div className="rgba-previewgrid">
                        <div>
                            <div className="rgba-label">Solid Color</div>
                            <div className="rgba-preview" style={{ background: hexColor }}>{hexColor}</div>
                        </div>
                        <div>
                            <div className="rgba-label">With Alpha</div>
                            <div className="rgba-preview rgba-preview--checker">
                                <div className="rgba-preview__fill" style={{ background: hexColor, opacity: vec4[3] }}>
                                    {alphaPercent.toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export { Rgba };
export default Rgba;
