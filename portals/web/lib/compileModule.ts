// Compiles JSX and TypeScript to plain JavaScript for the preview (keeps import/export as they are)
import type { transform as Transform } from 'sucrase';

type Transforms = Parameters<typeof Transform>[1]['transforms'];

export function compileWith(transform: typeof Transform) {
  return (code: string, path: string): string => {
    const lower = path.toLowerCase();
    const transforms: Transforms = lower.endsWith('.ts')
      ? ['typescript']
      : lower.endsWith('.tsx')
        ? ['typescript', 'jsx']
        : ['jsx']; // .js and .jsx: React projects often use JSX in .js files
    return transform(code, { transforms, jsxRuntime: 'automatic', production: true, filePath: path }).code;
  };
}

// Sucrase is only downloaded when a project needs it
export async function loadCompiler() {
  const { transform } = await import('sucrase');
  return compileWith(transform);
}
