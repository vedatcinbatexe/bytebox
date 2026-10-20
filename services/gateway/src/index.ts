import { createServer } from 'node:http';
import { createSchema, createYoga } from 'graphql-yoga';

const port = Number(process.env.PORT ?? 4000);

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Query {
        health: String!
      }
    `,
    resolvers: {
      Query: {
        health: () => 'ok',
      },
    },
  }),
});

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'gateway' }));
    return;
  }
  yoga(req, res);
});

server.listen(port, () => {
  console.log(`Gateway running on http://localhost:${port}/graphql`);
});
