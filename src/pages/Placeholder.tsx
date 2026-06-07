export function Placeholder({ title }: { title: string }) {
    return (
        <div className="grid h-full place-items-center text-center">
            <div className="space-y-2">
                <h1 className="text-xl font-semibold text-white/80">{title}</h1>
                <p className="text-sm text-white/40">Not ported yet — coming in a later phase.</p>
            </div>
        </div>
    );
}
