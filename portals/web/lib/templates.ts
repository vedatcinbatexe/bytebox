// Starter code shown the first time a language is picked
export const TEMPLATES: Record<string, string> = {
  python: `name = input()
print(f"Hello, {name}!")
`,
  javascript: `const input = require('fs').readFileSync(0, 'utf8').trim();
console.log(\`Hello, \${input}!\`);
`,
  cpp: `#include <iostream>
#include <string>

int main() {
    std::string name;
    std::getline(std::cin, name);
    std::cout << "Hello, " << name << "!" << std::endl;
    return 0;
}
`,
};

export const DEFAULT_LANGUAGES = [
  { id: 'python', name: 'Python' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'cpp', name: 'C++' },
];
