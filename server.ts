import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

const PORT = 3000;

interface Player {
  id: string;
  name: string;
  role?: 'assassin' | 'doctor' | 'detective' | 'citizen';
  isAlive: boolean;
  socketId: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface GameState {
  phase: 'lobby' | 'role-reveal' | 'night' | 'day' | 'results';
  players: Player[];
  killedId: string | null;
  savedId: string | null;
  investigatedId: string | null;
  votes: Record<string, string>; // voterId -> targetId
  message: string;
  chat: ChatMessage[];
  lastKilledId: string | null;
}

const games: Record<string, GameState> = {};
const serverStates: Record<string, { nightTimeout: NodeJS.Timeout | null, actedRoles: string[] }> = {};

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  // Default game room for demo
  const DEFAULT_ROOM = "main-room";
  games[DEFAULT_ROOM] = {
    phase: 'lobby',
    players: [],
    killedId: null,
    savedId: null,
    investigatedId: null,
    votes: {},
    message: "",
    chat: [],
    lastKilledId: null
  };
  serverStates[DEFAULT_ROOM] = { nightTimeout: null, actedRoles: [] };

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", ({ name }) => {
      const room = games[DEFAULT_ROOM];
      const newPlayer: Player = {
        id: socket.id,
        name,
        isAlive: true,
        socketId: socket.id
      };
      
      room.players.push(newPlayer);
      socket.join(DEFAULT_ROOM);
      
      io.to(DEFAULT_ROOM).emit("game-update", room);
    });

    socket.on("send-chat", ({ text }) => {
      const room = games[DEFAULT_ROOM];
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || !text.trim()) return;

      const newMessage: ChatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        senderId: player.id,
        senderName: player.name,
        text: text.trim(),
        timestamp: Date.now()
      };

      room.chat.push(newMessage);
      if (room.chat.length > 50) room.chat.shift();

      io.to(DEFAULT_ROOM).emit("game-update", room);
    });

    socket.on("start-game", () => {
      const room = games[DEFAULT_ROOM];
      if (room.players.length < 3) {
        socket.emit("error-msg", "Mínimo de 3 jogadores para iniciar.");
        return;
      }

      const roles: ('assassin' | 'doctor' | 'detective' | 'citizen')[] = ['assassin', 'doctor', 'detective'];
      while (roles.length < room.players.length) {
        roles.push('citizen');
      }
      
      const shuffledRoles = [...roles].sort(() => Math.random() - 0.5);
      room.players.forEach((p, i) => {
        p.role = shuffledRoles[i];
      });

      room.phase = 'role-reveal';
      room.message = "Os papéis foram distribuídos.";
      io.to(DEFAULT_ROOM).emit("game-update", room);

      setTimeout(() => {
        room.phase = 'night';
        room.message = "A cidade dorme... Vocês têm 60 segundos para agir!";
        room.lastKilledId = null; // reseta mancha de sangue
        serverStates[DEFAULT_ROOM].actedRoles = [];
        
        io.to(DEFAULT_ROOM).emit("game-update", room);

        serverStates[DEFAULT_ROOM].nightTimeout = setTimeout(() => {
          resolveNight(DEFAULT_ROOM);
        }, 60000);
      }, 4000);
    });

    socket.on("night-action", ({ targetId }) => {
      const room = games[DEFAULT_ROOM];
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || room.phase !== 'night') return;

      if (player.role === 'assassin') room.killedId = targetId;
      if (player.role === 'doctor') room.savedId = targetId;
      if (player.role === 'detective') {
        room.investigatedId = targetId;
        const target = room.players.find(p => p.id === targetId);
        // Responde só pro detetive
        socket.emit("error-msg", `Investigação: ${target?.name} é ${target?.role === 'assassin' ? 'Assassino' : 'Cidadão/Médico'}.`);
      }

      if (!serverStates[DEFAULT_ROOM].actedRoles.includes(player.role as string)) {
        serverStates[DEFAULT_ROOM].actedRoles.push(player.role as string);
      }

      // Check if all special roles have acted
      const specialRolesAlive = room.players
        .filter(p => p.isAlive && ['assassin', 'doctor', 'detective'].includes(p.role as string))
        .map(p => p.role as string);
      
      const allActed = specialRolesAlive.every(role => serverStates[DEFAULT_ROOM].actedRoles.includes(role));

      if (allActed) {
        if (serverStates[DEFAULT_ROOM].nightTimeout) {
          clearTimeout(serverStates[DEFAULT_ROOM].nightTimeout);
          serverStates[DEFAULT_ROOM].nightTimeout = null;
        }
        resolveNight(DEFAULT_ROOM);
      }
    });

    socket.on("vote", ({ targetId }) => {
      const room = games[DEFAULT_ROOM];
      if (room.phase !== 'day') return;

      room.votes[socket.id] = targetId;
      
      // If everyone voted
      const alivePlayers = room.players.filter(p => p.isAlive);
      if (Object.keys(room.votes).length >= alivePlayers.length) {
        resolveDay(DEFAULT_ROOM);
      } else {
        io.to(DEFAULT_ROOM).emit("game-update", room);
      }
    });

    socket.on("disconnect", () => {
      const room = games[DEFAULT_ROOM];
      room.players = room.players.filter(p => p.socketId !== socket.id);
      io.to(DEFAULT_ROOM).emit("game-update", room);
      console.log("User disconnected:", socket.id);
    });
  });

  function resolveNight(roomId: string) {
    const room = games[roomId];
    if (room.phase !== 'night') return;

    const { killedId, savedId } = room;
    let deathMessage = "Ninguém morreu esta noite.";
    
    room.players = room.players.map(p => {
      if (p.id === killedId && killedId !== savedId) {
        deathMessage = `${p.name} foi eliminado durante a noite.`;
        room.lastKilledId = p.id;
        return { ...p, isAlive: false };
      }
      return p;
    });

    room.phase = 'day';
    room.message = deathMessage;
    room.killedId = null;
    room.savedId = null;
    room.investigatedId = null;
    serverStates[roomId].actedRoles = [];
        
    io.to(roomId).emit("game-update", room);
  }

  function resolveDay(roomId: string) {
    const room = games[roomId];
    const voteCounts: Record<string, number> = {};
    
    Object.values(room.votes).forEach(id => {
      voteCounts[id] = (voteCounts[id] || 0) + 1;
    });

    let eliminatedId = null;
    let maxVotes = 0;
    for (const [id, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = id;
      }
    }

    if (eliminatedId) {
      const eliminatedPlayer = room.players.find(p => p.id === eliminatedId);
      room.players = room.players.map(p => p.id === eliminatedId ? { ...p, isAlive: false } : p);
      room.message = `A cidade votou e eliminou ${eliminatedPlayer?.name}. Ele era ${eliminatedPlayer?.role === 'assassin' ? 'o Assassino!' : 'Inocente.'}`;
    } else {
      room.message = "A cidade não chegou a um consenso.";
    }

    room.votes = {};
    io.to(roomId).emit("game-update", room);

    setTimeout(() => {
      // Check win conditions
      const assassins = room.players.filter(p => p.role === 'assassin' && p.isAlive);
      const citizens = room.players.filter(p => p.role !== 'assassin' && p.isAlive);

      if (assassins.length === 0) {
        room.phase = 'results';
        room.message = "OS CIDADÃOS VENCERAM!";
      } else if (assassins.length >= citizens.length) {
        room.phase = 'results';
        room.message = "OS ASSASSINOS VENCERAM!";
      } else {
        room.phase = 'night';
        room.message = "A cidade dorme... Vocês têm 60 segundos para agir!";
        room.lastKilledId = null; // reseta mancha de sangue
        serverStates[roomId].actedRoles = [];
        serverStates[roomId].nightTimeout = setTimeout(() => {
          resolveNight(roomId);
        }, 60000);
      }
      io.to(roomId).emit("game-update", room);
    }, 4000);
  }

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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
