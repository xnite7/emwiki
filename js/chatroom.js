export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = [];
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.connections.push(server);

    server.addEventListener("message", (event) => {
      const msg = event.data;
      for (const ws of this.connections) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      }
    });

    server.addEventListener("close", () => {
      this.connections = this.connections.filter((ws) => ws !== server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
