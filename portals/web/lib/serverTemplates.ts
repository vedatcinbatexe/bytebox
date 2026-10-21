import type { WorkspaceTemplate } from './templates';

// Server projects: started with "▶ Start server" (services/devserver) and shown in the 🖥 Server tab.
// Every server listens on port 8080 (process.env.PORT, server.port, ASPNETCORE_URLS are set for you).

const TODO_PAGE = (apiNote: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>To-do API</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; }
      li { padding: 4px 0; }
      .done { text-decoration: line-through; opacity: 0.6; }
    </style>
  </head>
  <body>
    <h1>To-dos</h1>
    <p>${apiNote}</p>
    <form id="form"><input id="title" placeholder="Something to do" required /> <button>Add</button></form>
    <ul id="list"></ul>
    <script>
      async function load() {
        const todos = await (await fetch('/api/todos')).json();
        document.getElementById('list').innerHTML = todos
          .map((todo) => '<li class="' + (todo.done ? 'done' : '') + '">' + todo.title + '</li>')
          .join('');
      }
      document.getElementById('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('title');
        await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: input.value }),
        });
        input.value = '';
        load();
      });
      load();
    </script>
  </body>
</html>
`;

export const SERVER_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'express',
    name: 'Express API',
    description: 'A Node.js REST API with Express, plus a small page that uses it.',
    icon: '🚂',
    files: {
      'package.json': `{
  "name": "express-api",
  "private": true,
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^5.1.0"
  }
}
`,
      'server.js': `const express = require('express');
const todos = require('./routes/todos');

const app = express();
app.use(express.json());
app.use(express.static('public')); // public/index.html is the home page
app.use('/api/todos', todos);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(\`Express listening on port \${port}\`));
`,
      'routes/todos.js': `const { Router } = require('express');

const router = Router();
const todos = [{ id: 1, title: 'Try GET /api/todos', done: false }];

router.get('/', (req, res) => res.json(todos));

router.post('/', (req, res) => {
  if (!req.body?.title) return res.status(400).json({ error: 'title is required' });
  const todo = { id: todos.length + 1, title: req.body.title, done: false };
  todos.push(todo);
  console.log('Added', todo);
  res.status(201).json(todo);
});

router.patch('/:id', (req, res) => {
  const todo = todos.find((item) => item.id === Number(req.params.id));
  if (!todo) return res.status(404).json({ error: 'not found' });
  todo.done = Boolean(req.body?.done);
  res.json(todo);
});

module.exports = router;
`,
      'public/index.html': TODO_PAGE('Served by Express. The data comes from <code>/api/todos</code>.'),
    },
  },
  {
    id: 'spring-boot',
    name: 'Spring Boot API',
    description: 'A Java REST API with a Spring Boot controller and a small page.',
    icon: '🍃',
    files: {
      'pom.xml': `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.5.3</version>
  </parent>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <version>0.0.1</version>
  <properties>
    <java.version>21</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>
`,
      'src/main/java/com/example/demo/DemoApplication.java': `package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}
`,
      'src/main/java/com/example/demo/Todo.java': `package com.example.demo;

public record Todo(int id, String title, boolean done) {}
`,
      'src/main/java/com/example/demo/TodoController.java': `package com.example.demo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/todos")
public class TodoController {
    private final List<Todo> todos = new ArrayList<>(List.of(new Todo(1, "Try GET /api/todos", false)));

    @GetMapping
    public List<Todo> all() {
        return todos;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Todo add(@RequestBody Map<String, String> body) {
        Todo todo = new Todo(todos.size() + 1, body.get("title"), false);
        todos.add(todo);
        System.out.println("Added " + todo);
        return todo;
    }

    @GetMapping("/{id}")
    public Todo one(@PathVariable int id) {
        return todos.stream().filter(todo -> todo.id() == id).findFirst().orElseThrow();
    }
}
`,
      'src/main/resources/application.properties': `spring.application.name=demo
spring.main.banner-mode=off
`,
      'src/main/resources/static/index.html': TODO_PAGE('Served by Spring Boot. The data comes from <code>/api/todos</code>.'),
    },
  },
  {
    id: 'aspnet-core',
    name: 'ASP.NET Core API',
    description: 'A C# minimal API with .NET, plus a small page.',
    icon: '🟣',
    files: {
      'TodoApi.csproj': `<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

</Project>
`,
      'Program.cs': `var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var todos = new List<Todo> { new(1, "Try GET /api/todos", false) };

app.UseDefaultFiles(); // wwwroot/index.html is the home page
app.UseStaticFiles();

app.MapGet("/api/todos", () => todos);

app.MapGet("/api/todos/{id:int}", (int id) =>
    todos.FirstOrDefault(todo => todo.Id == id) is { } todo ? Results.Ok(todo) : Results.NotFound());

app.MapPost("/api/todos", (NewTodo input) =>
{
    var todo = new Todo(todos.Count + 1, input.Title, false);
    todos.Add(todo);
    app.Logger.LogInformation("Added {Title}", todo.Title);
    return Results.Created($"/api/todos/{todo.Id}", todo);
});

app.Run();

record Todo(int Id, string Title, bool Done);
record NewTodo(string Title);
`,
      'wwwroot/index.html': TODO_PAGE('Served by ASP.NET Core. The data comes from <code>/api/todos</code>.'),
    },
  },
];
