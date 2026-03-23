import { Response } from 'express';

interface SSEClient {
  operatorId: string;
  res: Response;
}

const clients: Set<SSEClient> = new Set();

export function addSSEClient(operatorId: string, res: Response): SSEClient {
  const client: SSEClient = { operatorId, res };
  clients.add(client);
  console.log(`[SSE] Client connected for operator ${operatorId}. Total: ${clients.size}`);
  return client;
}

export function removeSSEClient(client: SSEClient): void {
  clients.delete(client);
  console.log(`[SSE] Client disconnected. Total: ${clients.size}`);
}

export function broadcastToOperator(operatorId: string, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let sent = 0;
  for (const client of clients) {
    if (client.operatorId === operatorId) {
      try {
        client.res.write(payload);
        sent++;
      } catch {
        clients.delete(client);
      }
    }
  }
  if (sent > 0) {
    console.log(`[SSE] Broadcast "${event}" to ${sent} client(s) for operator ${operatorId}`);
  }
}
