import { Skeleton } from '@/components/ui/Skeleton';

const NAME_WIDTHS = ['48%', '62%', '39%', '55%', '44%', '68%'];

/** Loading state shaped like Port's initial collapsed VFX system list. */
export function PortSystemSkeleton({ isTarget }: { isTarget: boolean }) {
    return (
        <div className="port-system-skeleton" aria-hidden="true">
            {Array.from({ length: 14 }).map((_, systemIndex) => {
                const delay = ((systemIndex % 3) + 1) as 1 | 2 | 3;
                return (
                    <div className="port-system-skeleton__system" key={systemIndex}>
                        <div className="port-system-skeleton__head">
                            <div className="port-system-skeleton__collapse"><Skeleton width={11} height={11} radius={3} delayClass={delay} /></div>
                            <div className="port-system-skeleton__title">
                                {!isTarget && <Skeleton width={28} height={28} radius={7} delayClass={delay} />}
                                <Skeleton height={12} radius={4} delayClass={delay} style={{ width: NAME_WIDTHS[systemIndex % NAME_WIDTHS.length] }} />
                                {systemIndex % 3 === 1 && <Skeleton width={45} height={15} radius={8} delayClass={delay} />}
                                <Skeleton width={25} height={18} radius={9} delayClass={delay} />
                            </div>
                            {isTarget && <div className="port-system-skeleton__menu"><Skeleton width={26} height={26} radius={6} delayClass={delay} /></div>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
