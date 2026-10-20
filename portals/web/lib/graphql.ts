// Small GraphQL client: fetch for queries/mutations, EventSource (SSE) for subscriptions

export const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000/graphql';

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

export class GraphQLRequestError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

function firstError<T>(response: GraphQLResponse<T>): GraphQLRequestError | null {
  const error = response.errors?.[0];
  return error ? new GraphQLRequestError(error.message, error.extensions?.code) : null;
}

export async function request<T>(query: string, variables?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new GraphQLRequestError('Cannot reach the Bytebox API', 'NETWORK_ERROR');
  }

  const body = (await response.json()) as GraphQLResponse<T>;
  const error = firstError(body);
  if (error) throw error;
  return body.data as T;
}

// Returns a function that closes the subscription
export function subscribe<T>(
  query: string,
  variables: object,
  onData: (data: T) => void,
  onError: (error: GraphQLRequestError) => void,
): () => void {
  const url = new URL(GATEWAY_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('variables', JSON.stringify(variables));

  const source = new EventSource(url);
  const close = () => source.close();

  source.addEventListener('next', (event) => {
    const body = JSON.parse((event as MessageEvent).data) as GraphQLResponse<T>;
    const error = firstError(body);
    if (error) {
      close();
      onError(error);
    } else if (body.data) {
      onData(body.data);
    }
  });
  // The server sends "complete" when the stream ends; close so EventSource doesn't reconnect
  source.addEventListener('complete', close);
  source.onerror = () => {
    close();
    onError(new GraphQLRequestError('Lost connection to the Bytebox API', 'NETWORK_ERROR'));
  };

  return close;
}
