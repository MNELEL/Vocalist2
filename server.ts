import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Create HTTP server
  const server = http.createServer(app);

  // Setup WebSocket server attached to the HTTP server
  const wss = new WebSocketServer({ server });

  // Simple in-memory document state for last-write-wins collaboration
  // documentId -> state object
  const documents: Record<string, any> = {};

  wss.on("connection", (ws, req) => {
    let currentDocId: string | null = null;
    let currentUserInfo: any = null;

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'join') {
          currentDocId = data.docId;
          currentUserInfo = data.userInfo;
          ws.send(JSON.stringify({ type: 'init', state: documents[currentDocId!] || null }));
        } else if (data.type === 'update') {
          if (currentDocId) {
            documents[currentDocId] = { ...documents[currentDocId], ...data.state };
            // Broadcast to other clients
            wss.clients.forEach(client => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'update', state: data.state }));
              }
            });
          }
        } else if (data.type === 'cursor') {
          // Relay cursor position
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'cursor', cursor: data.cursor, user: currentUserInfo }));
            }
          });
        }
      } catch (err) {
        console.error('WS Error:', err);
      }
    });

    ws.on("close", () => {
      // Clean up cursor on disconnect
      if (currentDocId && currentUserInfo) {
         wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'cursor_leave', userId: currentUserInfo.uid }));
          }
        });
      }
    });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
