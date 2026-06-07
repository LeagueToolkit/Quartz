import { getCurrentWindow } from '@tauri-apps/api/window';
import { Settings as SettingsIcon, Minus, Square, X } from 'lucide-react';
import { useNavigationStore } from '@/lib/stores';
import { log } from '@/lib/util/logger';

const win = getCurrentWindow();

export function TitleBar() {
    const setPage = useNavigationStore((s) => s.setPage);

    const minimize = () => win.minimize().catch((e) => log.error('minimize', e));
    const maximize = () => win.toggleMaximize().catch((e) => log.error('maximize', e));
    const close = () => win.close().catch((e) => log.error('close', e));

    return (
        <div
            data-tauri-drag-region
            className="flex items-center h-9 shrink-0 select-none border-b border-white/10 bg-[#15151c] pl-3"
        >
            <span data-tauri-drag-region className="text-sm font-semibold tracking-wide text-white/80">
                Quartz
            </span>

            <div className="flex-1" data-tauri-drag-region />

            <button
                onClick={() => setPage('settings')}
                title="Settings"
                className="grid h-9 w-11 place-items-center text-white/60 hover:bg-white/10 hover:text-white"
            >
                <SettingsIcon size={15} />
            </button>
            <button
                onClick={minimize}
                title="Minimize"
                className="grid h-9 w-11 place-items-center text-white/60 hover:bg-white/10 hover:text-white"
            >
                <Minus size={15} />
            </button>
            <button
                onClick={maximize}
                title="Maximize"
                className="grid h-9 w-11 place-items-center text-white/60 hover:bg-white/10 hover:text-white"
            >
                <Square size={13} />
            </button>
            <button
                onClick={close}
                title="Close"
                className="grid h-9 w-11 place-items-center text-white/60 hover:bg-red-600 hover:text-white"
            >
                <X size={16} />
            </button>
        </div>
    );
}
