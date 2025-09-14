import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuid } from 'uuid';

type Client = {
  id: string;
  ws: WebSocket;
  room?: string;
};

type Message =
  | { type: 'join'; room: string }
  | { type: 'signal'; to?: string; data: any }
  | { type: 'list' };

const server = createServer();
const wss = new WebSocketServer({ server });
const clients = new Map<string, Client>();

function broadcastToRoom(room: string, exceptId: string | null, payload: any) {
  for (const c of clients.values()) {
    if (c.room === room && c.id !== exceptId) {
      c.ws.send(JSON.stringify(payload));
    }
  }
}

wss.on('connection', (ws) => {
  const id = uuid();
  const client: Client = { id, ws };
  clients.set(id, client);

  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', (raw) => {
    let msg: Message;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'join') {
      client.room = msg.room;
      ws.send(JSON.stringify({ type: 'joined', id, room: msg.room }));
      // tell others in room a new peer arrived
      broadcastToRoom(msg.room, id, { type: 'peer-joined', id });
    }

    if (msg.type === 'list') {
      const peers = [...clients.values()]
        .filter(c => c.room === client.room && c.id !== client.id)
        .map(c => c.id);
      ws.send(JSON.stringify({ type: 'peers', peers }));
    }

    if (msg.type === 'signal') {
      // signal to room (broadcast) or specific peer
      if (client.room) {
        if (msg.to) {
          const target = clients.get(msg.to);
          if (target && target.room === client.room) {
            target.ws.send(JSON.stringify({ type: 'signal', from: id, data: msg.data }));
          }
        } else {
          broadcastToRoom(client.room, id, { type: 'signal', from: id, data: msg.data });
        }
      }
    }
  });

  ws.on('close', () => {
    const room = client.room;
    clients.delete(id);
    if (room) {
      broadcastToRoom(room, null, { type: 'peer-left', id });
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server listening on http://localhost:${PORT}`);
});
