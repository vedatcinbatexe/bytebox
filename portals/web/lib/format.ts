// Format code with Prettier, loaded only when someone formats (it's a few hundred KB per language)

import { editorLanguage } from './project';

type Plugin = import('prettier').Plugin;

async function setup(language: string): Promise<{ parser: string; plugins: Plugin[] } | null> {
  const estree = async () => (await import('prettier/plugins/estree')).default as Plugin;
  const babel = async () => (await import('prettier/plugins/babel')).default as Plugin;
  switch (language) {
    case 'javascript':
      return { parser: 'babel', plugins: [await babel(), await estree()] };
    case 'typescript':
      return { parser: 'typescript', plugins: [(await import('prettier/plugins/typescript')).default, await estree()] };
    case 'json':
      return { parser: 'json', plugins: [await babel(), await estree()] };
    case 'css':
      return { parser: 'css', plugins: [(await import('prettier/plugins/postcss')).default] };
    case 'html':
      // Also formats <script> and <style> inside the page
      return {
        parser: 'html',
        plugins: [
          (await import('prettier/plugins/html')).default,
          (await import('prettier/plugins/postcss')).default,
          await babel(),
          await estree(),
        ],
      };
    case 'markdown':
      return { parser: 'markdown', plugins: [(await import('prettier/plugins/markdown')).default] };
    default:
      return null;
  }
}

export const FORMATTABLE_LANGUAGES = ['javascript', 'typescript', 'json', 'css', 'html', 'markdown'];

export function canFormat(path: string): boolean {
  return FORMATTABLE_LANGUAGES.includes(editorLanguage(path));
}

// Returns the formatted code; throws with a readable message on syntax errors
export async function formatCode(path: string, code: string): Promise<string> {
  const options = await setup(editorLanguage(path));
  if (!options) throw new Error('This kind of file can’t be formatted');
  const prettier = await import('prettier/standalone');
  try {
    return await prettier.format(code, { ...options, singleQuote: true, printWidth: 100 });
  } catch (error) {
    const message = (error as Error).message.split('\n')[0];
    throw new Error(`Can’t format: ${message}`);
  }
}
