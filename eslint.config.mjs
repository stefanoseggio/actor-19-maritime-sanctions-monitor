import prettier from 'eslint-config-prettier';

import apify from '@apify/eslint-config/ts.js';
import globals from 'globals';
import tsEslint from 'typescript-eslint';

// eslint-disable-next-line import-x/no-default-export
export default [
    // mcp/ is deliberately outside tsconfig.json's "include" (it's a
    // separate MCP-tool entry point, not part of the dist/main.js build) -
    // type-aware linting via parserOptions.project can't parse a file
    // outside the TS project, so it's excluded here rather than forced into
    // the main build's project scope.
    { ignores: ['**/dist', '**/test', '**/mcp', 'eslint.config.mjs'] },
    ...apify,
    prettier,
    {
        languageOptions: {
            parser: tsEslint.parser,
            parserOptions: {
                project: 'tsconfig.json',
            },
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        plugins: {
            '@typescript-eslint': tsEslint.plugin,
        },
        rules: {
            'no-console': 0,
        },
    },
];
