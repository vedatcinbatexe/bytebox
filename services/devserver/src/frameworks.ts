// Which framework a project uses, and how to start it. Every server listens on port 8080
// (PORT, SERVER_PORT and ASPNETCORE_URLS tell the frameworks), inside a container without internet.

export interface ProjectFile {
  path: string;
  content: string;
}

export interface Framework {
  id: 'node' | 'spring' | 'dotnet';
  name: string;
  image: string;
  memoryMb: number;
  script: string; // shell script run in /workspace; file paths are already checked (no spaces or quotes)
  warnings: string[]; // shown in the server log before it starts
}

export const PORT = 8080;

// Installed in bytebox/server-node (images/node/package.json); there is no internet to install others
export const NODE_PACKAGES = ['express', 'cors', 'body-parser', 'uuid'];

const IMAGES = {
  node: process.env.NODE_SERVER_IMAGE ?? 'bytebox/server-node',
  spring: process.env.SPRING_SERVER_IMAGE ?? 'bytebox/server-spring',
  dotnet: process.env.DOTNET_SERVER_IMAGE ?? 'bytebox/server-dotnet',
};

export function detectFramework(files: ProjectFile[]): Framework | { error: string } {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const paths = [...byPath.keys()];

  // ASP.NET Core: a .csproj file
  const csproj = paths.find((path) => path.endsWith('.csproj'));
  if (csproj) {
    return {
      id: 'dotnet',
      name: 'ASP.NET Core',
      image: IMAGES.dotnet,
      memoryMb: 768,
      script: `exec dotnet run --project ${csproj}`,
      warnings: /PackageReference/.test(byPath.get(csproj)!)
        ? ['NuGet packages can’t be downloaded here (no internet); only what comes with .NET works.']
        : [],
    };
  }

  // Spring Boot: a class with @SpringBootApplication
  const javaFiles = paths.filter((path) => path.endsWith('.java') && !path.startsWith('src/test/'));
  const application = javaFiles.find((path) => /@SpringBootApplication\b/.test(byPath.get(path)!));
  if (application) {
    const source = byPath.get(application)!;
    const packageName = /^\s*package\s+([\w.]+)\s*;/m.exec(source)?.[1];
    const className = application.split('/').pop()!.replace(/\.java$/, '');
    const mainClass = packageName ? `${packageName}.${className}` : className;
    const resources = paths.some((path) => path.startsWith('src/main/resources/')) ? 'src/main/resources:' : '';
    return {
      id: 'spring',
      name: 'Spring Boot',
      image: IMAGES.spring,
      memoryMb: 768,
      // Compiled with javac against the Spring Boot libraries in the image (no Maven, no internet).
      // -parameters lets Spring read parameter names, e.g. for @PathVariable.
      script: [
        'mkdir -p /tmp/classes',
        `echo "Compiling ${javaFiles.length} Java file(s)…"`,
        `javac -encoding UTF-8 -parameters -d /tmp/classes -cp "/opt/spring/lib/*" ${javaFiles.join(' ')}`,
        `exec java -XX:TieredStopAtLevel=1 -Xmx384m -cp "/tmp/classes:${resources}/opt/spring/lib/*" ${mainClass}`,
      ].join(' && '),
      warnings: [],
    };
  }
  if (javaFiles.length > 0 && paths.includes('pom.xml')) {
    return { error: 'Add a class with @SpringBootApplication to start a Spring Boot server.' };
  }

  // Node.js: a package.json that uses Express (or a start script)
  if (byPath.has('package.json')) {
    let pkg: { main?: string; scripts?: Record<string, string>; dependencies?: Record<string, string> } = {};
    try {
      pkg = JSON.parse(byPath.get('package.json')!);
    } catch {
      return { error: 'package.json is not valid JSON.' };
    }
    const dependencies = Object.keys(pkg.dependencies ?? {});
    const start = pkg.scripts?.start;
    if (dependencies.includes('express') || start?.startsWith('node ')) {
      const main = [pkg.main, 'server.js', 'app.js', 'index.js', 'src/server.js', 'src/index.js'].find(
        (path) => path && byPath.has(path),
      );
      if (!start?.startsWith('node ') && !main) return { error: 'Add server.js (or a "start" script in package.json).' };
      const missing = dependencies.filter((name) => !NODE_PACKAGES.includes(name));
      return {
        id: 'node',
        name: 'Node.js',
        image: IMAGES.node,
        memoryMb: 256,
        // The pre-installed packages become the project's node_modules
        script: `ln -sfn /opt/deps/node_modules node_modules && exec ${start?.startsWith('node ') ? start : `node ${main}`}`,
        warnings: missing.map(
          (name) => `"${name}" isn’t installed (no internet). Available packages: ${NODE_PACKAGES.join(', ')}.`,
        ),
      };
    }
  }

  return { error: 'This project isn’t a server project (Express, Spring Boot or ASP.NET Core).' };
}
