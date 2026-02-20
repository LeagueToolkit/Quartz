/**
 * Ritobin Language Definition for Monaco Editor
 * 
 * This module defines a custom language for the Ritobin text format used in
 * League of Legends BIN files. It provides tokenization rules and a matching
 * theme that replicates the original syntax highlighting colors.
 * 
 * Token types:
 * - comment: Lines starting with # or //
 * - string: Double-quoted strings
 * - number: Integers and floats (including negative and 'f' suffix)
 * - hash-prefix: The '0x' prefix for hex values
 * - hash-value: Hex digits after 0x
 * - type: Type keywords (u8, u16, string, vec3, etc.)
 * - keyword: PascalCase identifiers (class/type names)
 * - property: Identifiers followed by : or =
 * - bool: true/false keywords
 * - operator: =, :, etc.
 * - bracket: {}, [], () with bracket colorization
 */

import type { Monaco } from '@monaco-editor/react';

/** Language ID used to register with Monaco */
export const RITOBIN_LANGUAGE_ID = 'ritobin';

/** Theme ID used to register with Monaco */
export const RITOBIN_THEME_ID = 'ritobin-dark';

/**
 * Register the Ritobin language with Monaco Editor.
 * Must be called with the Monaco instance from @monaco-editor/react callbacks.
 */
export function registerRitobinLanguage(monaco: Monaco): void {
    // Check if already registered
    const languages = monaco.languages.getLanguages();
    if (languages.some((lang: { id: string }) => lang.id === RITOBIN_LANGUAGE_ID)) {
        return;
    }

    // Register the language
    monaco.languages.register({ id: RITOBIN_LANGUAGE_ID });

    // Set the tokenization rules using Monarch grammar
    monaco.languages.setMonarchTokensProvider(RITOBIN_LANGUAGE_ID, {
        // Default token type
        defaultToken: '',

        // Keywords that represent types in the ritobin format
        typeKeywords: [
            'type', 'embed', 'pointer', 'link', 'option', 'list', 'map', 'hash',
            'flag', 'struct', 'u8', 'u16', 'u32', 'u64', 'i8', 'i16', 'i32', 'i64',
            'f32', 'f64', 'bool', 'string', 'vec2', 'vec3', 'vec4', 'mtx44', 'rgba', 'path'
        ],

        // Boolean literals
        boolKeywords: ['true', 'false'],

        // Tokenizer rules
        tokenizer: {
            root: [
                // Comments - lines starting with # or //
                [/#.*$/, 'comment'],
                [/\/\/.*$/, 'comment'],

                // Strings - double quoted
                [/"[^"\\]*(?:\\.[^"\\]*)*"/, 'string'],

                // Hex numbers - match the whole thing, we'll style it as one color
                [/0x[0-9a-fA-F]+/, 'number.hex'],

                // Numbers - integers and floats with optional negative and 'f' suffix
                [/-?\d+\.\d*f?/, 'number.float'],
                [/-?\d+f/, 'number.float'],
                [/-?\d+/, 'number'],

                // Brackets
                [/[{}]/, 'delimiter.bracket'],
                [/[\[\]]/, 'delimiter.square'],
                [/[()]/, 'delimiter.parenthesis'],

                // Operators
                [/[=:,]/, 'delimiter'],

                // Boolean keywords
                [/\b(true|false)\b/, 'keyword.bool'],

                // Type keywords - must come before general identifier matching
                [/\b(type|embed|pointer|link|option|list|map|hash|flag|struct|u8|u16|u32|u64|i8|i16|i32|i64|f32|f64|bool|string|vec2|vec3|vec4|mtx44|rgba|path)\b/, 'type'],

                // PascalCase identifiers (class/type names like VfxEmitterDefinitionData)
                [/[A-Z][a-zA-Z0-9_]*/, 'type.identifier'],

                // Property names (identifiers followed by : or =)
                [/[a-zA-Z_][a-zA-Z0-9_]*(?=\s*[:=])/, 'variable'],

                // Other identifiers
                [/[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],

                // Whitespace
                [/\s+/, 'white']
            ]
        }
    });

    // Configure bracket matching and auto-closing
    monaco.languages.setLanguageConfiguration(RITOBIN_LANGUAGE_ID, {
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ],
        autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' }
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' }
        ],
        comments: {
            lineComment: '#'
        }
    });
}

/**
 * Register the Ritobin dark theme with Monaco Editor.
 * Colors match the original CSS classes and app theme exactly.
 * Must be called with the Monaco instance from @monaco-editor/react callbacks.
 */
export function registerRitobinTheme(monaco: Monaco): void {
    monaco.editor.defineTheme(RITOBIN_THEME_ID, {
        base: 'vs-dark',
        inherit: false,
        rules: [
            // Default text
            { token: '', foreground: 'c0c0c0' },

            // Comments - muted green, italic (matches .ritobin-comment #6a9955)
            { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },

            // Property names/variables - pale yellow/tan (matches .ritobin-property #dcdcaa)
            { token: 'variable', foreground: 'dcdcaa' },

            // Type keywords - standard blue (matches .ritobin-type #569cd6)
            { token: 'type', foreground: '569cd6' },

            // Class/type names (PascalCase) - teal (matches .ritobin-keyword #4ec9b0)
            { token: 'type.identifier', foreground: '4ec9b0' },

            // Boolean keywords - standard blue (matches .ritobin-bool #569cd6)
            { token: 'keyword.bool', foreground: '569cd6' },

            // Hex numbers - purple (matches .ritobin-hash-value #bd93f9)
            { token: 'number.hex', foreground: 'bd93f9' },

            // Float numbers - soft green (matches .ritobin-number #b5cea8)
            { token: 'number.float', foreground: 'b5cea8' },

            // Integer numbers - soft green (matches .ritobin-number #b5cea8)
            { token: 'number', foreground: 'b5cea8' },

            // Strings - soft orange (matches .ritobin-string #ce9178)
            { token: 'string', foreground: 'ce9178' },

            // Delimiters/operators - light gray (matches .ritobin-operator #d4d4d4)
            { token: 'delimiter', foreground: 'd4d4d4' },

            // Brackets with colors (matches .ritobin-bracket-*)
            { token: 'delimiter.bracket', foreground: 'ffd700' },      // Gold - curly braces
            { token: 'delimiter.square', foreground: 'da70d6' },       // Orchid - square brackets
            { token: 'delimiter.parenthesis', foreground: '179fff' },  // Cyan - parentheses

            // Default identifiers
            { token: 'identifier', foreground: 'c0c0c0' }
        ],
        colors: {
            // Editor background - matches --bg-primary: #1b1b1b
            'editor.background': '#1b1b1b',
            // Editor foreground - matches --text-primary: #c0c0c0
            'editor.foreground': '#c0c0c0',

            // Line numbers - matches --text-muted: #707070
            'editorLineNumber.foreground': '#707070',
            'editorLineNumber.activeForeground': '#c0c0c0',

            // Gutter (line number area) - matches --bg-secondary: #191919
            'editorGutter.background': '#191919',

            // Current line highlight - matches --current-line: #222222
            'editor.lineHighlightBackground': '#222222',
            'editor.lineHighlightBorder': '#00000000',

            // Selection - matches --selection-bg
            'editor.selectionBackground': '#264f78',
            'editor.inactiveSelectionBackground': '#2a2a2a',

            // Cursor - matches --accent-primary: #0e639c
            'editorCursor.foreground': '#0e639c',

            // Scrollbar - matches scrollbar CSS variables
            'scrollbarSlider.background': '#3a3a3a88',
            'scrollbarSlider.hoverBackground': '#454545aa',
            'scrollbarSlider.activeBackground': '#555555ee',

            // Widget/dropdown backgrounds - matches --bg-tertiary: #1e1e1e
            'editorWidget.background': '#1e1e1e',
            'editorWidget.border': '#2d2d2d',
            'input.background': '#2a2a2a',
            'input.border': '#2d2d2d',
            'input.foreground': '#c0c0c0',

            // Find/Replace widget
            'editorFindMatch.background': '#515c6a',
            'editorFindMatchHighlight.background': '#314365',

            // Bracket matching
            'editorBracketMatch.background': '#0e639c44',
            'editorBracketMatch.border': '#0e639c',

            // Minimap
            'minimap.background': '#191919',
            'minimapSlider.background': '#3a3a3a44',
            'minimapSlider.hoverBackground': '#3a3a3a66',
            'minimapSlider.activeBackground': '#3a3a3a88'
        }
    });
}
