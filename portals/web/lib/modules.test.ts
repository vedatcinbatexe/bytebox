import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transform } from 'sucrase';
import { compileWith } from './compileModule';
import { buildModules } from './modules';

const compile = compileWith(transform);

function moduleCode(url: string): string {
  return Buffer.from(url.replace('data:text/javascript;base64,', ''), 'base64').toString('utf8');
}

const reactApp = {
  'index.html': '<div id="root"></div><script type="module" src="/src/main.jsx"></script>',
  'src/main.jsx':
    "import { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './index.css';\ncreateRoot(document.getElementById('root')).render(<App />);",
  'src/App.jsx': "import { useState } from 'react';\nimport { title } from './util.ts';\nexport default function App() { const [n] = useState(0); return <h1>{title} {n}</h1>; }",
  'src/util.ts': "export const title: string = 'Hello';",
  'src/index.css': 'h1 { color: red; }',
  'package.json': JSON.stringify({ dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1', 'canvas-confetti': '~1.9.3' } }),
};

test('a React app becomes an import map of compiled modules and CDN packages', () => {
  const { importMap, entry, errors } = buildModules(reactApp, 'src/main.jsx', compile);
  assert.deepEqual(errors, []);
  assert.equal(entry, '@project/src/main.jsx');
  assert.deepEqual(Object.keys(importMap.imports).sort(), [
    '@project/src/App.jsx',
    '@project/src/index.css',
    '@project/src/main.jsx',
    '@project/src/util.ts',
    'canvas-confetti', // listed in package.json: other packages may import it
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
  ]);
  assert.equal(
    importMap.imports['react-dom/client'],
    'https://esm.sh/react-dom@18.3.1/client?external=react,canvas-confetti',
  );
  // react and react/jsx-runtime use the same ?external build, so all of React is one copy
  assert.equal(importMap.imports.react, 'https://esm.sh/react@18.3.1?external=react-dom,canvas-confetti');

  const main = moduleCode(importMap.imports['@project/src/main.jsx']);
  assert.match(main, /from "@project\/src\/App\.jsx"|from '@project\/src\/App\.jsx'/);
  assert.match(main, /import ['"]@project\/src\/index\.css['"]/);
  assert.doesNotMatch(main, /<App/); // JSX was compiled
  assert.doesNotMatch(moduleCode(importMap.imports['@project/src/util.ts']), /: string/); // types were removed
  assert.match(moduleCode(importMap.imports['@project/src/index.css']), /createElement\('style'\)/);
});

test('missing files and syntax errors are reported, not thrown', () => {
  const files = {
    'main.jsx': "import './missing';\nimport Broken from './Broken.jsx';",
    'Broken.jsx': 'export default function () { return <div>; }',
  };
  const { errors } = buildModules(files, 'main.jsx', compile);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /can't find "\.\/missing"/);
  assert.match(errors[1], /^Broken\.jsx:/);
});

test('a page whose modules do not compile shows the errors instead of starting', async () => {
  const { buildPreviewDocument } = await import('./preview');
  const files = { 'index.html': '<body><script type="module" src="main.jsx"></script></body>', 'main.jsx': 'export default () => <div>;' };
  const html = buildPreviewDocument(files, 'index.html', compile);
  assert.doesNotMatch(html, /import\("@project\/main\.jsx"\)/);
  assert.match(html, /main\.jsx: Error transforming/);
});
