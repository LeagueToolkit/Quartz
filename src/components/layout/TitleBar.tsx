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
            <div data-tauri-drag-region className="flex h-full flex-1 items-center gap-2 pl-3">
                <img
                    src="/quartz-logo.png"
                    alt=""
                    onClick={() => setPage('home')}
                    className="q-titlebar-logo h-8 w-8 cursor-pointer rounded transition-transform hover:scale-[1.15]"
                    title="Home"
                />
                <span data-tauri-drag-region className="q-titlebar-title text-[14px] font-semibold">
                    Quartz
                </span>
            </div>
            <div className="q-winbtns">
                <button onClick={minimize} title="Minimize" className="q-winbtn"><Minus size={18} strokeWidth={2} /></button>
                <button onClick={maximize} title="Maximize" className="q-winbtn"><Square size={14} strokeWidth={2} /></button>
                <button onClick={close} title="Close" className="q-winbtn q-winbtn--close"><X size={18} strokeWidth={2} /></button>
            </div>
        </header>
    );
}
