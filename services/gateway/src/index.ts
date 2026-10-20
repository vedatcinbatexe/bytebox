import { createServer } from 'node:http';
import { createYoga } from 'graphql-yoga';
import { schema, type Context } from './schema.js';

const port = Number(process.env.PORT ?? 4000);

// GraphiQL is served at /graphql in the browser; subscriptions use Server-Sent Events
const yoga = createYoga<Context>({ schema });

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'gateway' }));
    return;
  }
  yoga(req, res, { req });
});

server.listen(port, () => {
  console.log(`Gateway running on http://localhost:${port}/graphql`);
});
