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
                    className="h-5 w-5 cursor-pointer rounded transition-transform hover:scale-110"
                    title="Home"
                />
                <span data-tauri-drag-region className="text-[13px] font-semibold tracking-[0.18em] text-white/85">
                    QUARTZ
                </span>
            </div>
            <button onClick={minimize} title="Minimize" className="q-winbtn"><Minus size={15} /></button>
            <button onClick={maximize} title="Maximize" className="q-winbtn"><Square size={12} /></button>
            <button onClick={close} title="Close" className="q-winbtn q-winbtn--close"><X size={16} /></button>
        </header>
    );
}
