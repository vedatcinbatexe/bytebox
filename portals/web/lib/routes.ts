// Finds the HTTP endpoints in a server project, for the API tester's list. It reads the code with
// simple patterns, so it covers the common styles (and may miss unusual ones):
//   Express:      app.get('/x', …), router.post('/', …) with app.use('/api/todos', require('./routes/todos'))
//   Spring Boot:  @RequestMapping("/api/todos") on the class + @GetMapping("/{id}") on methods
//   ASP.NET Core: app.MapGet("/api/todos/{id:int}", …)

export interface Route {
  method: string;
  path: string;
  file: string;
}

const VERBS = 'get|post|put|patch|delete';

function join(prefix: string, path: string): string {
  const joined = `/${prefix}/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

// "./routes/todos" from server.js → "routes/todos.js"
function resolve(fromPath: string, specifier: string, files: Record<string, string>): string | null {
  const folder = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const parts: string[] = [];
  for (const part of `${folder}/${specifier}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  const base = parts.join('/');
  return [base, `${base}.js`, `${base}/index.js`].find((candidate) => candidate in files) ?? null;
}

function expressRoutes(files: Record<string, string>): Route[] {
  const scripts = Object.keys(files).filter((path) => /\.(c|m)?js$/.test(path));
  // Which file is mounted at which prefix: app.use('/api/todos', todos) + const todos = require('./routes/todos')
  const prefixes = new Map<string, string>();
  for (const path of scripts) {
    const code = files[path];
    const required = new Map<string, string>();
    for (const match of code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const target = resolve(path, match[2], files);
      if (target) required.set(match[1], target);
    }
    for (const match of code.matchAll(/\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:require\(\s*['"](\.[^'"]+)['"]\s*\)|(\w+))/g)) {
      const target = match[2] ? resolve(path, match[2], files) : required.get(match[3]);
      if (target) prefixes.set(target, match[1]);
    }
  }
  const routes: Route[] = [];
  for (const path of scripts) {
    const pattern = new RegExp(`\\b\\w+\\.(${VERBS})\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g');
    for (const match of files[path].matchAll(pattern)) {
      routes.push({ method: match[1].toUpperCase(), path: join(prefixes.get(path) ?? '', match[2]), file: path });
    }
  }
  return routes;
}

function springRoutes(files: Record<string, string>): Route[] {
  const routes: Route[] = [];
  for (const path of Object.keys(files).filter((file) => file.endsWith('.java'))) {
    const code = files[path];
    if (!/@(Rest)?Controller\b/.test(code)) continue;
    // A @RequestMapping right before the class is the prefix of every method
    const classMapping = /@RequestMapping\(\s*(?:(?:value|path)\s*=\s*)?"([^"]*)"[^)]*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*public\s+class/.exec(code);
    const prefix = classMapping?.[1] ?? '';
    for (const match of code.matchAll(/@(Get|Post|Put|Patch|Delete)Mapping(?:\(\s*(?:(?:value|path)\s*=\s*)?(?:"([^"]*)")?[^)]*\))?/g)) {
      routes.push({ method: match[1].toUpperCase(), path: join(prefix, match[2] ?? ''), file: path });
    }
  }
  return routes;
}

function aspnetRoutes(files: Record<string, string>): Route[] {
  const routes: Route[] = [];
  for (const path of Object.keys(files).filter((file) => file.endsWith('.cs'))) {
    for (const match of files[path].matchAll(/\.Map(Get|Post|Put|Patch|Delete)\(\s*"([^"]*)"/g)) {
      routes.push({ method: match[1].toUpperCase(), path: join('', match[2]), file: path });
    }
  }
  return routes;
}

export function findRoutes(files: Record<string, string>): Route[] {
  const seen = new Set<string>();
  return [...expressRoutes(files), ...springRoutes(files), ...aspnetRoutes(files)].filter((route) => {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// "/api/todos/:id", "/{id}" or "/{id:int}" → "/api/todos/1", ready to send
export function examplePath(path: string): string {
  return path.replace(/:\w+/g, '1').replace(/\{[^}]+\}/g, '1');
}
