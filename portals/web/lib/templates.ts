import type { Project } from './project';

// Shown the first time someone opens Bytebox
export const STARTER_PROJECT: Project = {
  files: {
    'main.py': `from utils.greet import greet

name = input()
print(greet(name))
`,
    'utils/greet.py': `def greet(name):
    return f"Hello, {name}!"
`,
    'hello.js': `const name = require('fs').readFileSync(0, 'utf8').trim();
console.log(\`Hello from JavaScript, \${name}!\`);
`,
    'hello.cpp': `#include <iostream>
#include <string>

int main() {
    std::string name;
    std::getline(std::cin, name);
    std::cout << "Hello from C++, " << name << "!" << std::endl;
    return 0;
}
`,
  },
  folders: [],
};

export const STARTER_FILE = 'main.py';

// A new, empty workspace starts with this single file
export const NEW_WORKSPACE_FILE = 'init.js';
export const NEW_WORKSPACE_CODE = `console.log("hello world");
`;
