/**
 * Flint - Context Menu Component
 */

import React, { useEffect, useRef } from 'react';
import { useAppState } from '../lib/state';

export const ContextMenu: React.FC = () => {
    const { state, closeContextMenu } = useAppState();
    const menuRef = useRef<HTMLDivElement>(null);

    const isVisible = !!state.contextMenu;
    const menu = state.contextMenu;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                closeContextMenu();
            }
        };

        if (isVisible) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isVisible, closeContextMenu]);

    if (!isVisible || !menu) return null;

    // Adjust position to keep menu inside window
    const style: React.CSSProperties = {
        position: 'absolute',
        top: menu.y,
        left: menu.x,
        zIndex: 2000,
    };

    return (
        <div
            className="context-menu"
            ref={menuRef}
            style={style}
            onClick={(e) => e.stopPropagation()}
        >
            {menu.options.map((option, index) => (
                <div
                    key={index}
                    className={`context-menu__item ${option.danger ? 'context-menu__item--danger' : ''}`}
                    onClick={() => {
                        option.onClick();
                        closeContextMenu();
                    }}
                >
                    {option.icon && (
                        <span
                            className="context-menu__icon"
                            dangerouslySetInnerHTML={{ __html: option.icon }}
                        />
                    )}
                    <span className="context-menu__label">{option.label}</span>
                </div>
            ))}
        </div>
    );
};
