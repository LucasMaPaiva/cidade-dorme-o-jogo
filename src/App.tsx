import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Sun, Users, Shield, Search, Skull, Play, MessageSquare, CheckCircle2, LogIn } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

type GamePhase = 'lobby' | 'role-reveal' | 'night' | 'day' | 'results';
type Role = 'assassin' | 'doctor' | 'detective' | 'citizen';

interface Player {
  id: string;
  name: string;
  role?: Role;
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
  phase: GamePhase;
  players: Player[];
  killedId: string | null;
  savedId: string | null;
  investigatedId: string | null;
  votes: Record<string, string>;
  message: string;
  chat: ChatMessage[];
  lastKilledId: string | null;
}

let socket: Socket;

export default function App() {
  const [playerName, setPlayerName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [localMessage, setLocalMessage] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");

  useEffect(() => {
    socket = io();

    socket.on("game-update", (updatedState: GameState) => {
      setGameState(updatedState);
      const me = updatedState.players.find(p => p.id === socket.id);
      if (me?.role) setMyRole(me.role);
    });

    socket.on("error-msg", (msg: string) => {
      setLocalMessage(msg);
      setTimeout(() => setLocalMessage(""), 3000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinGame = () => {
    if (!playerName.trim()) return;
    socket.emit("join-room", { name: playerName });
    setIsJoined(true);
  };

  const startGame = () => {
    socket.emit("start-game");
  };

  const handleNightAction = (targetId: string) => {
    if (gameState?.phase !== 'night') return;
    socket.emit("night-action", { targetId });
    setLocalMessage(`Ação enviada para ${gameState.players.find(p => p.id === targetId)?.name}`);
  };

  const handleVote = (targetId: string) => {
    if (gameState?.phase !== 'day') return;
    socket.emit("vote", { targetId });
    setLocalMessage(`Voto computado em ${gameState.players.find(p => p.id === targetId)?.name}`);
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit("send-chat", { text: chatInput });
    setChatInput("");
  };

  if (!isJoined) {
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 text-white">
        <div className="fixed inset-0 atmosphere-night -z-10" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel max-w-md w-full p-8 text-center space-y-8 shadow-2xl bg-slate-900/60 border-white/10"
        >
          <div className="space-y-2">
            <h1 className="text-5xl font-serif font-bold tracking-tighter italic">Cidade Dorme</h1>
            <p className="text-sky-400 font-medium tracking-widest uppercase text-xs">Entre na Cidade</p>
          </div>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Seu nome..."
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all text-center text-lg"
              onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            />
            <button
              onClick={joinGame}
              className="w-full py-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              ENTRAR NA SALA
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!gameState) return null;

  const isNight = gameState.phase === 'night' || gameState.phase === 'role-reveal';
  const phaseClass = isNight ? 'phase-night' : 'phase-day';
  const atmosphereClass = isNight ? 'atmosphere-night' : 'atmosphere-day';

  return (
    <div className={`relative min-h-screen w-full overflow-hidden flex flex-col items-center justify-center p-4 transition-all duration-1000 ${phaseClass}`}>
      <div className={`fixed inset-0 -z-10 transition-all duration-1000 ${atmosphereClass}`} />
      
      <AnimatePresence mode="wait">
        {gameState.phase === 'lobby' && (
          <motion.div 
            key="lobby"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-panel max-w-md w-full p-8 text-center space-y-8 shadow-2xl"
          >
            <div className="space-y-2">
              <h1 className="text-5xl font-serif font-bold tracking-tighter italic">Cidade Dorme</h1>
              <p className="opacity-60 font-medium tracking-widest uppercase text-xs">Aguardando Jogadores</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5" />
                  <span className="font-medium text-sm">Jogadores na sala</span>
                </div>
                <span className="text-xl font-bold font-serif italic">{gameState.players.length}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {gameState.players.map(p => (
                  <div key={p.id} className="px-3 py-2 bg-white/5 rounded-lg text-sm border border-white/5 flex items-center gap-2 overflow-hidden">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${p.id === socket.id ? 'bg-green-500' : 'bg-sky-500'}`} />
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={startGame}
              className="group relative w-full py-4 bg-sky-500 text-slate-950 font-bold rounded-2xl overflow-hidden transition-all hover:scale-[1.02] active:scale-95"
            >
              <span className="relative flex items-center justify-center gap-2">
                <Play className="w-5 h-5 fill-current" />
                INICIAR JOGO
              </span>
            </button>
            
            {localMessage && <p className="text-xs text-red-500 animate-pulse">{localMessage}</p>}
          </motion.div>
        )}

        {gameState.phase === 'role-reveal' && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="text-center space-y-6"
          >
            <p className="opacity-60 uppercase tracking-widest text-sm">Seu papel secreto é:</p>
            <h2 className="text-6xl font-serif font-bold italic capitalize">
              {myRole === 'assassin' && 'Assassino'}
              {myRole === 'doctor' && 'Médico'}
              {myRole === 'detective' && 'Detetive'}
              {myRole === 'citizen' && 'Cidadão'}
            </h2>
            <div className="flex justify-center">
              {myRole === 'assassin' && <Skull className="w-24 h-24 text-sky-400" />}
              {myRole === 'doctor' && <Shield className="w-24 h-24 text-indigo-400" />}
              {myRole === 'detective' && <Search className="w-24 h-24 text-emerald-400" />}
              {myRole === 'citizen' && <Users className="w-24 h-24 opacity-60" />}
            </div>
          </motion.div>
        )}

        {(gameState.phase === 'night' || gameState.phase === 'day' || gameState.phase === 'results') && (
          <motion.div
            key={gameState.phase}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-5xl space-y-8"
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="flex items-center gap-4">
                {gameState.phase === 'night' ? <Moon className="w-8 h-8 text-sky-400" /> : <Sun className="w-8 h-8 text-indigo-500" />}
                <h2 className="text-3xl font-serif italic">
                  {gameState.phase === 'night' ? 'A cidade dorme...' : gameState.phase === 'results' ? 'Fim de Jogo' : 'A cidade acordou'}
                </h2>
              </div>
              {(gameState.message || localMessage) && (
                <motion.p 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="font-medium px-6 py-2 rounded-full border border-current/20 bg-current/5"
                >
                  {localMessage || gameState.message}
                </motion.p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {gameState.players.map(p => (
                <motion.div
                  key={p.id}
                  whileHover={p.isAlive && p.id !== socket.id ? { scale: 1.02 } : {}}
                  className={`glass-panel p-6 flex items-center justify-between transition-all ${!p.isAlive ? 'opacity-30 grayscale' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${p.id === socket.id ? 'ring-2 ring-current' : 'bg-white/5'}`}>
                      {p.isAlive ? <Users className="w-6 h-6" /> : <Skull className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="font-bold text-lg">{p.name} {p.id === socket.id && '(Você)'}</p>
                      <p className="text-xs opacity-50 uppercase tracking-tighter">
                        {p.isAlive ? 'Vivo' : 'Eliminado'}
                      </p>
                    </div>
                  </div>

                  {p.isAlive && p.id !== socket.id && gameState.phase === 'night' && myRole !== 'citizen' && (
                    <button 
                      onClick={() => handleNightAction(p.id)}
                      className="p-3 rounded-full hover:bg-current/10 border border-current/20 transition-colors"
                    >
                      {myRole === 'assassin' && <Skull className="w-5 h-5" />}
                      {myRole === 'doctor' && <Shield className="w-5 h-5" />}
                      {myRole === 'detective' && <Search className="w-5 h-5" />}
                    </button>
                  )}

                  {p.isAlive && p.id !== socket.id && gameState.phase === 'day' && (
                    <button 
                      onClick={() => handleVote(p.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-xs font-bold"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      VOTAR
                    </button>
                  )}
                </motion.div>
              ))}
            </div>

            {gameState.phase === 'day' && (
              <div className="flex justify-center">
                <div className="glass-panel px-8 py-4 flex items-center gap-4 text-sm">
                  <MessageSquare className="w-5 h-5" />
                  <span>Debatam! Quem você acha que é o assassino?</span>
                </div>
              </div>
            )}
            
            {gameState.phase === 'results' && (
              <div className="flex justify-center">
                <button 
                  onClick={() => window.location.reload()}
                  className="px-8 py-4 bg-indigo-500 text-white font-bold rounded-2xl hover:bg-indigo-400 transition-all"
                >
                  JOGAR NOVAMENTE
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-8 left-8 flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-[0.2em] opacity-40">Status do Servidor</span>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-mono opacity-60">WS_ACTIVE_SESSION</span>
        </div>
      </div>

      {/* Blood Splatter */}
      {gameState.lastKilledId && gameState.phase === 'day' && (
        <div className="blood-splatter" />
      )}

      {/* Floating Chat Button */}
      {gameState.phase !== 'lobby' && (
        <button 
          onClick={() => setChatOpen(!chatOpen)}
          className="fixed bottom-8 right-8 p-4 bg-sky-500 text-slate-900 rounded-full shadow-lg hover:bg-sky-400 transition-colors z-[60] flex items-center justify-center shrink-0"
        >
          <MessageSquare className="w-6 h-6" />
          {gameState.chat?.length > 0 && !chatOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse border-2 border-slate-900" />
          )}
        </button>
      )}

      {/* Chat Panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div 
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className="fixed bottom-24 right-8 w-80 h-[28rem] glass-panel flex flex-col overflow-hidden z-[60] shadow-2xl bg-[#0f172a]/95 backdrop-blur-3xl"
          >
            <div className="bg-white/5 p-4 font-bold flex justify-between items-center border-b border-white/10">
              Chat da Cidade
              <button onClick={() => setChatOpen(false)} className="text-xs opacity-50 hover:opacity-100 uppercase tracking-wider transition-opacity">Fechar</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col flex-nowrap shrink-0">
              {gameState.chat?.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.senderId === socket.id ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] opacity-50 mb-1">{msg.senderName}</span>
                  <div className={`px-3 py-2 text-sm shadow-md max-w-[85%] ${msg.senderId === socket.id ? 'bg-sky-500 text-slate-900 rounded-2xl rounded-tr-sm' : 'bg-white/10 text-white rounded-2xl rounded-tl-sm'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-black/40 border-t border-white/10 flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Digite algo..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 text-white placeholder:text-white/30"
              />
              <button 
                onClick={sendChat}
                className="bg-sky-500 text-slate-900 px-4 py-2 rounded-xl hover:bg-sky-400 font-bold transition-colors"
              >
                →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
