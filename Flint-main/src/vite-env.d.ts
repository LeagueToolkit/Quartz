/// <reference types="vite/client" />

// Declare Vite worker import syntax
declare module '*?worker' {
    const workerConstructor: {
        new (): Worker;
    };
    export default workerConstructor;
}
