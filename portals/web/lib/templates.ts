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

// Starting points offered by "Create workspace"
export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  files: Record<string, string>;
  stdin?: string;
}

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'blank-js',
    name: 'Blank JavaScript',
    description: 'One file, init.js, that prints "hello world".',
    icon: '✨',
    files: { [NEW_WORKSPACE_FILE]: NEW_WORKSPACE_CODE },
  },
  {
    id: 'python-basics',
    name: 'Python basics',
    description: 'Input, loops, functions and a helper module.',
    icon: '🐍',
    stdin: 'Ada\n5',
    files: {
      'main.py': `from helpers.math_tools import is_even, squares

name = input("What's your name? ")
count = int(input("How many numbers? "))

print(f"\\nHi {name}! Here are {count} squares:")
for number, square in squares(count):
    kind = "even" if is_even(square) else "odd"
    print(f"  {number}² = {square} ({kind})")
`,
      'helpers/math_tools.py': `def squares(count):
    """Pairs of (n, n²) for n = 1..count."""
    return [(n, n * n) for n in range(1, count + 1)]


def is_even(number):
    return number % 2 == 0
`,
    },
  },
  {
    id: 'python-data',
    name: 'Python data',
    description: 'Read a CSV file and print a small report.',
    icon: '📊',
    files: {
      'main.py': `import csv

with open("data/scores.csv") as file:
    rows = list(csv.DictReader(file))

scores = [int(row["score"]) for row in rows]
best = max(rows, key=lambda row: int(row["score"]))

print(f"Players: {len(rows)}")
print(f"Average: {sum(scores) / len(scores):.1f}")
print(f"Best:    {best['name']} ({best['score']})")
print()
for row in sorted(rows, key=lambda row: -int(row["score"])):
    bar = "█" * (int(row["score"]) // 5)
    print(f"{row['name']:<8} {row['score']:>3} {bar}")
`,
      'data/scores.csv': `name,score
Ada,92
Linus,78
Grace,88
Alan,65
Margaret,97
`,
    },
  },
  {
    id: 'node-app',
    name: 'Node.js app',
    description: 'A small to-do list split into modules.',
    icon: '🟩',
    files: {
      'index.js': `const { TodoList } = require('./lib/todo');

const todos = new TodoList();
todos.add('Write some code');
todos.add('Run it in Bytebox');
todos.add('Share the link');
todos.complete(1);

console.log(todos.toString());
console.log(\`\\n\${todos.remaining()} of \${todos.items.length} left\`);
`,
      'lib/todo.js': `class TodoList {
  constructor() {
    this.items = [];
  }

  add(text) {
    this.items.push({ text, done: false });
  }

  complete(index) {
    this.items[index].done = true;
  }

  remaining() {
    return this.items.filter((item) => !item.done).length;
  }

  toString() {
    return this.items.map((item, i) => \`\${i + 1}. [\${item.done ? 'x' : ' '}] \${item.text}\`).join('\\n');
  }
}

module.exports = { TodoList };
`,
    },
  },
  {
    id: 'cpp-project',
    name: 'C++ project',
    description: 'main.cpp with a header and a second source file.',
    icon: '⚙️',
    files: {
      'main.cpp': `#include <iostream>
#include <vector>
#include "stats.h"

int main() {
    std::vector<int> numbers = {4, 8, 15, 16, 23, 42};
    std::cout << "Numbers: ";
    for (int n : numbers) std::cout << n << ' ';
    std::cout << "\\nSum:     " << sum(numbers)
              << "\\nAverage: " << average(numbers) << std::endl;
    return 0;
}
`,
      'stats.h': `#pragma once
#include <vector>

int sum(const std::vector<int>& numbers);
double average(const std::vector<int>& numbers);
`,
      'stats.cpp': `#include "stats.h"

int sum(const std::vector<int>& numbers) {
    int total = 0;
    for (int n : numbers) total += n;
    return total;
}

double average(const std::vector<int>& numbers) {
    return numbers.empty() ? 0 : static_cast<double>(sum(numbers)) / numbers.size();
}
`,
    },
  },
  {
    id: 'algorithms',
    name: 'Algorithms',
    description: 'Sorting and searching in Python, one file each.',
    icon: '🧮',
    files: {
      'main.py': `from sorting.bubble import bubble_sort
from searching.binary import binary_search

numbers = [29, 3, 17, 8, 42, 11, 5]
ordered = bubble_sort(numbers)
print("Sorted:", ordered)

for target in (17, 6):
    index = binary_search(ordered, target)
    print(f"{target}: {'found at index ' + str(index) if index >= 0 else 'not found'}")
`,
      'sorting/bubble.py': `def bubble_sort(items):
    items = list(items)
    for end in range(len(items) - 1, 0, -1):
        for i in range(end):
            if items[i] > items[i + 1]:
                items[i], items[i + 1] = items[i + 1], items[i]
    return items
`,
      'searching/binary.py': `def binary_search(items, target):
    low, high = 0, len(items) - 1
    while low <= high:
        middle = (low + high) // 2
        if items[middle] == target:
            return middle
        if items[middle] < target:
            low = middle + 1
        else:
            high = middle - 1
    return -1
`,
    },
  },
];

WORKSPACE_TEMPLATES.push({
  id: 'web-page',
  name: 'Web page',
  description: 'HTML, CSS and JavaScript with a live preview.',
  icon: '🌐',
  files: {
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My page</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <h1>Hello from Bytebox 👋</h1>
      <p>Edit index.html, style.css or script.js and watch the preview update.</p>
      <button id="counter">Clicked 0 times</button>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`,
    'style.css': `body {
  font-family: system-ui, sans-serif;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
  background: linear-gradient(135deg, #1e1b4b, #0f766e);
  color: white;
}

button {
  font-size: 1.1rem;
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
}
`,
    'script.js': `const button = document.getElementById('counter');
let clicks = 0;

button.addEventListener('click', () => {
  clicks += 1;
  button.textContent = \`Clicked \${clicks} time\${clicks === 1 ? '' : 's'}\`;
  console.log('Button clicked', clicks);
});

console.log('Page loaded');
`,
  },
});

WORKSPACE_TEMPLATES.push(
  {
    id: 'typescript',
    name: 'TypeScript',
    description: 'Types, interfaces and imports, run directly by Node.js.',
    icon: '🔷',
    files: {
      'main.ts': `import { average, type Score } from './lib/scores.ts';

const scores: Score[] = [
  { player: 'Ada', points: 92 },
  { player: 'Linus', points: 78 },
  { player: 'Grace', points: 88 },
];

for (const { player, points } of scores) {
  console.log(\`\${player.padEnd(6)} \${points}\`);
}
console.log(\`Average: \${average(scores).toFixed(1)}\`);
`,
      'lib/scores.ts': `export interface Score {
  player: string;
  points: number;
}

export function average(scores: Score[]): number {
  return scores.reduce((total, score) => total + score.points, 0) / scores.length;
}
`,
    },
  },
  {
    id: 'java',
    name: 'Java',
    description: 'A Main class using a second class, with input.',
    icon: '☕',
    stdin: 'Duke',
    files: {
      'Main.java': `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        String name = in.hasNextLine() ? in.nextLine() : "world";

        Counter counter = new Counter();
        for (int i = 0; i < 3; i++) {
            counter.increment();
        }
        System.out.println("Hello, " + name + "!");
        System.out.println("Counted to " + counter.value());
    }
}
`,
      'Counter.java': `public class Counter {
    private int value;

    public void increment() {
        value++;
    }

    public int value() {
        return value;
    }
}
`,
    },
  },
  {
    id: 'go',
    name: 'Go',
    description: 'main.go using a function from a second file, with input.',
    icon: '🐹',
    stdin: 'Gopher',
    files: {
      'main.go': `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	name := "world"
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		name = scanner.Text()
	}
	fmt.Printf("Hello, %s!\n", name)
	fmt.Println("Squares:", squares(5))
}
`,
      'squares.go': `package main

func squares(n int) []int {
	result := make([]int, n)
	for i := range result {
		result[i] = (i + 1) * (i + 1)
	}
	return result
}
`,
    },
  },
  {
    id: 'rust',
    name: 'Rust',
    description: 'main.rs with a module in a second file, with input.',
    icon: '🦀',
    stdin: 'Ferris',
    files: {
      'main.rs': `mod shapes;

use std::io::stdin;

fn main() {
    let mut name = String::new();
    stdin().read_line(&mut name).unwrap();
    let name = if name.trim().is_empty() { "world" } else { name.trim() };
    println!("Hello, {name}!");

    let square = shapes::Rectangle { width: 3.0, height: 3.0 };
    println!("Area of the square: {}", square.area());
}
`,
      'shapes.rs': `pub struct Rectangle {
    pub width: f64,
    pub height: f64,
}

impl Rectangle {
    pub fn area(&self) -> f64 {
        self.width * self.height
    }
}
`,
    },
  },
);
