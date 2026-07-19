import {
    useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './tooltip.css';

type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

interface TooltipProps {
    content: ReactNode;
    children: ReactNode;
    side?: TooltipSide;
    delay?: number;
}

interface Position {
    left: number;
    top: number;
}

/** Portal tooltip based on Celestial's delayed navigation tooltip behavior. */
export function Tooltip({ content, children, side = 'top', delay = 350 }: TooltipProps) {
    const triggerRef = useRef<HTMLSpanElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const timerRef = useRef<number | null>(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<Position>({ left: 0, top: 0 });

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const updatePosition = useCallback(() => {
        const trigger = triggerRef.current;
        const tooltip = tooltipRef.current;
        if (!trigger || !tooltip) return;
        const anchor = trigger.getBoundingClientRect();
        const bubble = tooltip.getBoundingClientRect();
        const gap = 8;
        let left = anchor.left + (anchor.width - bubble.width) / 2;
        let top = anchor.top - bubble.height - gap;
        if (side === 'right') {
            left = anchor.right + gap;
            top = anchor.top + (anchor.height - bubble.height) / 2;
        } else if (side === 'bottom') {
            top = anchor.bottom + gap;
        } else if (side === 'left') {
            left = anchor.left - bubble.width - gap;
            top = anchor.top + (anchor.height - bubble.height) / 2;
        }
        const margin = 6;
        setPosition({
            left: Math.min(Math.max(left, margin), window.innerWidth - bubble.width - margin),
            top: Math.min(Math.max(top, margin), window.innerHeight - bubble.height - margin),
        });
    }, [side]);

    const show = useCallback(() => {
        clearTimer();
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            setOpen(true);
        }, delay);
    }, [clearTimer, delay]);

    const hide = useCallback(() => {
        clearTimer();
        setOpen(false);
    }, [clearTimer]);

    useLayoutEffect(() => {
        if (!open) return;
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open, updatePosition]);

    useEffect(() => () => clearTimer(), [clearTimer]);

    return (
        <>
            <span
                ref={triggerRef}
                className="q-tooltip-trigger"
                onMouseEnter={show}
                onMouseLeave={hide}
                onFocus={show}
                onBlur={hide}
                onClick={hide}
            >
                {children}
            </span>
            {open && createPortal(
                <div
                    ref={tooltipRef}
                    role="tooltip"
                    className={`q-tooltip q-tooltip--${side}`}
                    style={{ left: position.left, top: position.top }}
                >
                    {content}
                </div>,
                document.body,
            )}
        </>
    );
}
