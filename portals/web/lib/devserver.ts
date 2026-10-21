// Server projects (Express, Spring Boot, ASP.NET Core) run on the devserver service, which decides
// exactly how to start them (services/devserver/src/frameworks.ts). This is a quick check to show
// "▶ Start server" for projects that look like one.

export const DEVSERVER_URL = process.env.NEXT_PUBLIC_DEVSERVER_URL ?? 'ws://localhost:4300';

export function serverFramework(files: Record<string, string>): string | null {
  const paths = Object.keys(files);
  if (paths.some((path) => path.endsWith('.csproj'))) return 'ASP.NET Core';
  if (paths.some((path) => path.endsWith('.java') && /@SpringBootApplication\b/.test(files[path]))) return 'Spring Boot';
  try {
    const pkg = JSON.parse(files['package.json'] ?? 'null');
    if (pkg?.dependencies?.express || String(pkg?.scripts?.start ?? '').startsWith('node ')) return 'Node.js';
  } catch {
    // not a valid package.json: not a server project
  }
  return null;
}
