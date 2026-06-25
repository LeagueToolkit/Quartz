import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';
import { useNavigationStore } from '@/lib/stores';
import { log } from '@/lib/util/logger';

const win = getCurrentWindow();

export function TitleBar() {
    const setPage = useNavigationStore((s) => s.setPage);
    const minimize = () => win.minimize().catch((e) => log.error('minimize', e));
    const maximize = () => win.toggleMaximize().catch((e) => log.error('maximize', e));
    const close = () => win.close().catch((e) => log.error('close', e));

    return (
        <header className="q-titlebar shrink-0">
            <div data-tauri-drag-region className="q-titlebar-brand">
                <img
                    src="/quartz-logo.png"
                    alt=""
                    onClick={() => setPage('home')}
                    className="q-titlebar-logo"
                    title="Home"
                />
                <span data-tauri-drag-region className="q-titlebar-title">Quartz</span>
            </div>
            <div className="q-winbtns">
                <button onClick={minimize} title="Minimize" className="q-winbtn"><Minus size={17} strokeWidth={2} /></button>
                <button onClick={maximize} title="Maximize" className="q-winbtn"><Square size={13} strokeWidth={2} /></button>
                <button onClick={close} title="Close" className="q-winbtn q-winbtn--close"><X size={17} strokeWidth={2} /></button>
            </div>
        </header>
    );
}
