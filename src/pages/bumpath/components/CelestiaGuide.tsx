import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import SpotlightOverlay, { type SpotlightRect } from './SpotlightOverlay';

/* CelestiaGuide
   A reusable, bottom-right guide/tour component for Celestia. */

export interface CelestiaStep {
    title: string;
    text: string;
    ctaLabel?: string;
    ctaPath?: string;
    ctaUrl?: string;
    targetSelector?: string;
    padding?: number;
}

interface CelestiaGuideProps {
    id: string;
    steps?: CelestiaStep[];
    onClose?: () => void;
    onSkipToTop?: () => void;
    onStepChange?: (stepIndex: number) => void;
    enableTopRightForSteps?: number[];
}

interface TargetRect extends SpotlightRect {
    padding: number;
}

const CelestiaGuide = ({
    id,
    steps = [],
    onClose,
    onSkipToTop,
    onStepChange,
    enableTopRightForSteps = [],
}: CelestiaGuideProps) => {
    const [entered, setEntered] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
    const celestiaSrc = '/celestia.webp';

    const total = steps.length;
    const current = steps[stepIndex] || ({} as CelestiaStep);

    const storageKey = useMemo(() => `celestiaGuideSeen:${id}`, [id]);

    useEffect(() => {
        const enterId = setTimeout(() => setEntered(true), 20);
        return () => clearTimeout(enterId);
    }, []);

    const finish = () => {
        try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
        setExiting(true);
        setTimeout(() => onClose && onClose(), 500);
    };

    const handleNext = () => {
        if (stepIndex < total - 1) {
            const newIndex = stepIndex + 1;
            setStepIndex(newIndex);
            if (onStepChange) onStepChange(newIndex);
        } else {
            finish();
        }
    };

    const handlePrev = () => {
        if (stepIndex > 0) {
            const newIndex = stepIndex - 1;
            setStepIndex(newIndex);
            if (onStepChange) onStepChange(newIndex);
        }
    };

    const handleSkip = () => finish();

    // Notify parent of step changes
    useEffect(() => {
        if (onStepChange) {
            onStepChange(stepIndex);
        }
    }, [stepIndex, onStepChange]);

    // Compute and scroll to target element
    useEffect(() => {
        const step = steps[stepIndex];
        if (!step || !step.targetSelector) {
            setTargetRect(null);
            return;
        }
        const element = document.querySelector(step.targetSelector);
        if (!element) {
            setTargetRect(null);
            return;
        }

        const updateRect = () => {
            const rect = element.getBoundingClientRect();
            setTargetRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, padding: step.padding ?? 10 });
        };

        /* For step 7 (index 6), wait for settings panel animation to complete
           (300ms transition) before calculating the highlight. */
        if (stepIndex === 6) {
            const timer = setTimeout(() => {
                updateRect();
                setTimeout(updateRect, 100);
            }, 400);
            return () => clearTimeout(timer);
        }

        updateRect();

        // Keep rect updated on resize/scroll
        const onResize = () => updateRect();
        const onScroll = () => updateRect();
        window.addEventListener('resize', onResize, { passive: true });
        window.addEventListener('scroll', onScroll, true);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [stepIndex, steps]);

    // Determine if we should position at top-right (only if enabled for this step index)
    const isTopRight = enableTopRightForSteps.includes(stepIndex);

    const guideContent = (
        <div
            className={
                `fixed ${isTopRight ? 'top-4' : 'bottom-4'} right-4 z-50 flex ${isTopRight ? 'items-start' : 'items-end'} gap-4 transform will-change-transform will-change-opacity ` +
                `transition-all duration-700 ease-in-out ` +
                `${entered && !exiting ? 'translate-x-0 opacity-100' : ''} ` +
                `${!entered ? 'translate-x-full opacity-0' : ''} ` +
                `${exiting ? 'translate-x-full opacity-0' : ''}`
            }
            style={{ zIndex: 6000 }}
        >
            {/* Spotlight overlay */}
            <SpotlightOverlay rect={targetRect} padding={targetRect?.padding ?? 10} />

            {/* Speech bubble */}
            <div
                className="relative rounded-2xl shadow-2xl backdrop-blur-sm w-96 p-4 pr-10 flex flex-col"
                style={{
                    position: 'relative',
                    zIndex: 9000,
                    minHeight: 180,
                    order: isTopRight ? 1 : 2,
                    background: 'var(--bg-secondary)',
                    border: '1px solid color-mix(in oklab, var(--accent-primary) 45%, var(--border))',
                }}
            >
                {/* Close */}
                <button
                    onClick={() => {
                        if (typeof onSkipToTop === 'function') {
                            try { onSkipToTop(); } catch { /* ignore */ }
                        }
                        handleSkip();
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors text-[var(--text-secondary)] hover:text-white hover:bg-[var(--color-danger)]"
                    aria-label="Close"
                >
                    <X size={14} />
                </button>

                {/* Decorative top bar */}
                <div
                    className="absolute -top-1 left-4 right-4 h-1.5 rounded-full"
                    style={{ background: 'linear-gradient(90deg, var(--accent-secondary), var(--accent-primary), var(--accent-secondary))' }}
                />

                {/* Header */}
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse bg-[var(--accent-primary)]" />
                    <h3 className="font-semibold text-xs tracking-wide text-[var(--accent-primary)]">Guide</h3>
                    <div className="ml-auto text-[10px] text-[var(--text-muted)]">Step {stepIndex + 1} of {total}</div>
                </div>

                <div className="mb-1 font-semibold text-sm text-[var(--text-primary)]">{current.title}</div>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{current.text}</p>

                {/* Actions */}
                <div className="mt-auto pt-2 flex items-center gap-2 flex-nowrap">
                    <button
                        onClick={handlePrev}
                        disabled={stepIndex === 0}
                        className={`px-2 py-1 h-7 leading-none whitespace-nowrap rounded-full border border-[var(--border)] text-xs flex items-center gap-1 transition text-[var(--text-secondary)] ` +
                            `${stepIndex === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--bg-hover)]'}`}
                    >
                        <ChevronLeft size={14} /> Prev
                    </button>
                    <button
                        onClick={handleNext}
                        className="px-3 py-1 h-7 leading-none whitespace-nowrap rounded-full border text-xs flex items-center gap-1 border-[color-mix(in_oklab,var(--accent-primary)_50%,var(--border))] bg-[color-mix(in_oklab,var(--accent-primary)_12%,transparent)] text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_22%,transparent)]"
                    >
                        {stepIndex < total - 1 ? 'Next' : 'Finish'} <ChevronRight size={14} />
                    </button>
                    <button
                        onClick={() => {
                            if (typeof onSkipToTop === 'function') {
                                try { onSkipToTop(); } catch { /* ignore */ }
                            }
                            handleSkip();
                        }}
                        className="ml-auto h-7 leading-none whitespace-nowrap text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                        Skip tour
                    </button>
                </div>

                {/* Tail pointer - points towards character */}
                {isTopRight ? (
                    <div className="absolute right-0 top-6 translate-x-full w-0 h-0 border-t-8 border-b-8 border-l-8 border-t-transparent border-b-transparent border-l-[var(--bg-secondary)]" />
                ) : (
                    <div className="absolute left-0 bottom-6 -translate-x-full w-0 h-0 border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-[var(--bg-secondary)]" />
                )}
            </div>

            {/* Character */}
            <div className="relative" style={{ position: 'relative', zIndex: 9000, order: isTopRight ? 2 : 1 }}>
                <img
                    src={celestiaSrc}
                    alt="Celestial"
                    className="w-48 h-48 object-contain drop-shadow-2xl brightness-110 contrast-110"
                    onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const fallback = document.createElement('div');
                        fallback.className = 'w-24 h-24 flex items-center justify-center text-6xl';
                        fallback.textContent = '✨';
                        target.parentElement?.appendChild(fallback);
                    }}
                />
                <div
                    className="absolute inset-0 rounded-full blur-xl -z-10"
                    style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--accent-primary) 25%, transparent), transparent 70%)' }}
                />
                <div
                    className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold animate-bounce shadow-lg"
                    style={{ background: 'var(--accent-primary)', color: '#fff', border: '1px solid color-mix(in oklab, white 70%, transparent)' }}
                >
                    {stepIndex + 1}
                </div>
            </div>
        </div>
    );

    // Render the entire guide into body so it sits above any parent stacking contexts
    return createPortal(guideContent, document.body);
};

export default CelestiaGuide;
