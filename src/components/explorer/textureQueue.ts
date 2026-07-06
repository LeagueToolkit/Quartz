/* Concurrency-limited async queue. Ported from old Quartz's textureQueue,
   which throttled texture decoding so heavy scrolling never froze the grid.
   Here it caps how many decode tasks run at once instead of a hard 16ms
   stagger, so thumbnails fill in smoothly without stalling the UI thread. */

const MAX = 3;
let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
    if (active < MAX) {
        active++;
        return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
}

function release(): void {
    const next = waiting.shift();
    if (next) {
        // Hand the slot directly to the next waiter (active stays occupied).
        next();
    } else {
        active--;
    }
}

export const textureQueue = {
    async add<T>(task: () => Promise<T>): Promise<T> {
        await acquire();
        try {
            return await task();
        } finally {
            release();
        }
    },
};
