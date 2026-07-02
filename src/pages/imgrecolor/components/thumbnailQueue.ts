/* Thumbnail loading queue with scroll-aware scheduling + LRU cache. Keeps
   scrolling responsive in large folders by pausing decode work while the user
   scrolls and capping concurrency. Extracted from ImgRecolor for readability. */

interface QueueJob {
    key: string;
    task: () => Promise<string | null>;
    promiseHandlers: { resolve: (v: string | null) => void; reject: (e: unknown) => void };
}

export const thumbnailQueue = {
    queue: [] as QueueJob[],
    activeCount: 0,
    maxConcurrent: Math.max(2, Math.min(4, Math.floor(((typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8) || 8) / 3))),
    pausedUntil: 0,
    scrollListenerAttached: false,
    inflight: new Map<string, Promise<string | null>>(),
    cache: new Map<string, string>(),
    maxCacheSize: 600,

    attachScrollTracking() {
        if (this.scrollListenerAttached || typeof document === 'undefined') return;
        this.scrollListenerAttached = true;

        const markScrolling = () => {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            this.pausedUntil = now + 140;
            setTimeout(() => this.process(), 150);
        };

        document.addEventListener('scroll', markScrolling, true);
        document.addEventListener('wheel', markScrolling, { passive: true });
        document.addEventListener('touchmove', markScrolling, { passive: true });
    },

    getCached(key: string): string | null {
        if (!this.cache.has(key)) return null;
        const cached = this.cache.get(key)!;
        // touch for LRU
        this.cache.delete(key);
        this.cache.set(key, cached);
        return cached;
    },

    setCached(key: string, objectUrl: string | null) {
        if (!objectUrl) return;
        if (this.cache.has(key)) {
            const prev = this.cache.get(key);
            if (prev && prev !== objectUrl) URL.revokeObjectURL(prev);
            this.cache.delete(key);
        }
        this.cache.set(key, objectUrl);

        while (this.cache.size > this.maxCacheSize) {
            const oldestKey = this.cache.keys().next().value as string;
            const oldestUrl = this.cache.get(oldestKey);
            if (oldestUrl) URL.revokeObjectURL(oldestUrl);
            this.cache.delete(oldestKey);
        }
    },

    clearCache() {
        for (const objectUrl of this.cache.values()) {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
        this.cache.clear();
        this.inflight.clear();
        this.queue = [];
        this.activeCount = 0;
    },

    add(key: string, task: () => Promise<string | null>): Promise<string | null> {
        this.attachScrollTracking();
        const cached = this.getCached(key);
        if (cached) return Promise.resolve(cached);
        if (this.inflight.has(key)) return this.inflight.get(key)!;

        const managedPromise = new Promise<string | null>((resolve, reject) => {
            this.queue.push({ key, task, promiseHandlers: { resolve, reject } });
            this.process();
        }).then((result) => {
            if (result) this.setCached(key, result);
            return result;
        }).finally(() => {
            this.inflight.delete(key);
        });

        this.inflight.set(key, managedPromise);
        return managedPromise;
    },

    process() {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (now < this.pausedUntil) return;

        while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
            const job = this.queue.shift()!;
            this.activeCount += 1;

            Promise.resolve()
                .then(() => (job.task ? job.task() : null))
                .then((result) => {
                    job.promiseHandlers?.resolve(result);
                    return result;
                })
                .catch((e) => {
                    job.promiseHandlers?.reject(e);
                })
                .finally(() => {
                    this.activeCount -= 1;
                    if (this.queue.length > 0) {
                        if (typeof requestAnimationFrame === 'function') {
                            requestAnimationFrame(() => this.process());
                        } else {
                            setTimeout(() => this.process(), 0);
                        }
                    }
                });
        }
    },
};
