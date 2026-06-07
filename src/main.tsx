import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from '@/lib/stores';
import { App } from '@/App';
import '@/styles/index.css';
import '@/styles/shell.css';

const container = document.getElementById('app');
if (!container) throw new Error('[Quartz] #app element not found');

document.getElementById('loading-screen')?.remove();

createRoot(container).render(
    React.createElement(
        React.StrictMode,
        null,
        React.createElement(AppProvider, null, React.createElement(App)),
    ),
);
