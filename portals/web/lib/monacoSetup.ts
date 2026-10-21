import type { BeforeMount } from '@monaco-editor/react';

type Monaco = Parameters<BeforeMount>[0];

// TypeScript/JSX settings for the editor: React files (.tsx) shouldn't be full of red squiggles
// just because the editor can't see npm packages (they come from a CDN when the preview runs).
export function configureLanguages(monaco: Monaco) {
  const typescript = monaco.languages.typescript.typescriptDefaults;
  typescript.setCompilerOptions({
    ...typescript.getCompilerOptions(),
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
  });
  typescript.setDiagnosticsOptions({
    ...typescript.getDiagnosticsOptions(),
    // Cannot find module 'x' · module resolution hints · missing react/jsx-runtime · no type declarations
    diagnosticCodesToIgnore: [2307, 2792, 2875, 7016],
  });
}
