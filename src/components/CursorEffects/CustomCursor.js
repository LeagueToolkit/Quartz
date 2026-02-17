import { useEffect } from 'react';

const MIME = {
    cur: 'image/vnd.microsoft.icon',
    png: 'image/png',
    gif: 'image/gif',
};

const CustomCursor = ({ path, size = 32 }) => {
    useEffect(() => {
        if (!path) return;

        const ext = path.split('.').pop().toLowerCase();
        let cleanup = () => {};

        try {
            const fs = window.require('fs');
            const buffer = fs.readFileSync(path);
            const base64 = buffer.toString('base64');
            const mime = MIME[ext] || 'image/png';
            const dataUri = `data:${mime};base64,${base64}`;

            const style = document.createElement('style');
            style.id = 'cursor-effect-style';
            style.textContent = '* { cursor: none !important; }';
            document.head.appendChild(style);

            const el = document.createElement('div');
            el.id = 'custom-cursor-element';
            el.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;top:0;left:0;will-change:transform;';

            const img = document.createElement('img');
            img.src = dataUri;
            img.style.cssText = `display:block;width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;`;
            el.appendChild(img);
            document.body.appendChild(el);

            const onMove = (e) => {
                el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
            };
            document.addEventListener('mousemove', onMove);

            cleanup = () => {
                style.remove();
                document.getElementById('custom-cursor-element')?.remove();
                document.removeEventListener('mousemove', onMove);
            };
        } catch (e) {
            console.error('[CustomCursor] Failed to apply cursor:', e);
        }

        return cleanup;
    }, [path, size]);

    return null;
};

export default CustomCursor;
