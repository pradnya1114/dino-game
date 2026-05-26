/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Play } from 'lucide-react';
import DinoGame from './components/DinoGame';
import ResultPage from './components/ResultPage';
import RulesPage from './components/RulesPage';

type GameState = 'start' | 'rules' | 'playing' | 'result';

const App: React.FC = () => {
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('dino_player_name') || '';
  });
  const [gameState, setGameState] = useState<GameState>('start');
  const [finalScore, setFinalScore] = useState(0);
  const [gameId, setGameId] = useState(0);
  const [isCameraEnabled, setIsCameraEnabled] = useState(() => {
    return localStorage.getItem('dino_camera_enabled') === 'true';
  });

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      setGameState('rules');
    }
  };

  const handleBeginGame = () => {
    setGameState('playing');
  };

  const handleGameOver = (score: number) => {
    setFinalScore(score);
    setGameId(Date.now());
    setGameState('result');
  };

  const handleCameraReady = () => {
    setIsCameraEnabled(true);
    localStorage.setItem('dino_camera_enabled', 'true');
  };

  const handleRestart = React.useCallback(() => {
    setGameState('start');
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-game-bg text-game-text font-press-start selection:bg-game-accent selection:text-white">
      {/* Persistent Global Logo */}
      <div className="fixed top-4 left-2 z-50 pointer-events-none sm:pointer-events-auto">
        <img 
          src="/logo.png" 
          alt="Dino Jump Logo" 
          className="w-12 h-12 md:w-38 md:h-32 rounded-lg  border-game-text -[4px_4px_0_0_#333] transition-transform hover:scale-110"
        />
      </div>

      <AnimatePresence mode="wait">
        {gameState === 'start' && (
          <motion.div
            key="start-screen"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="w-full max-w-md bg-game-canvas p-8 rounded-xl shadow-2xl border-4 border-game-text flex flex-col items-center gap-8 z-10"
          >
            <div className="text-center group">
              <h1 className="text-3xl md:text-4xl mb-2 text-game-text tracking-tighter transition-all duration-300 group-hover:text-game-accent">
                DINO JUMP
              </h1>
              <div className="h-1 w-24 bg-game-text mx-auto group-hover:w-full transition-all duration-500 rounded-full" />
            </div>

            <form onSubmit={handleStart} className="w-full flex flex-col gap-6">
              <div className="space-y-3">
                <label htmlFor="playerName" className="text-xs uppercase tracking-widest text-game-text/70 flex items-center gap-2">
                  <User size={14} />
                  Player Name
                </label>
                <input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full bg-game-bg border-4 border-game-text p-4 text-sm font-press-start hover:border-game-accent focus:border-game-accent focus:outline-none transition-colors rounded-lg placeholder:text-game-text/30"
                  maxLength={15}
                  required
                  autoFocus
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                className="w-full bg-game-text text-white p-5 rounded-lg font-press-start text-sm flex items-center justify-center gap-3 hover:bg-game-accent transition-colors shadow-[0_6px_0_0_#333] active:shadow-none active:translate-y-[2px]"
              >
                <Play size={18} fill="currentColor" />
                GET STARTED
              </motion.button>
            </form>

            <p className="text-[10px] text-center text-game-text/50 leading-relaxed uppercase">
              Burn calories, not just time.<br />
              Jump in real-life to dodge obstacles!
            </p>
          </motion.div>
        )}

        {gameState === 'rules' && (
          <RulesPage 
            key="rules-screen"
            onStartGame={handleBeginGame}
          />
        )}

        {gameState === 'playing' && (
          <motion.div
            key="game-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 w-screen h-screen bg-game-bg flex flex-col items-center justify-center overflow-hidden"
          >
            {/* Centered Top UI */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
              <div className="bg-game-canvas px-6 py-3 border-4 border-game-text rounded-xl shadow-[6px_6px_0_0_#333] flex items-center gap-4">
                <span className="text-game-accent text-sm animate-pulse">●</span>
                <span className="text-xs uppercase tracking-[0.2em] font-bold">{playerName}</span>
              </div>
              <button 
                onClick={handleRestart}
                className="text-center text-[8px] text-game-text/50 hover:text-game-accent transition-all uppercase tracking-[0.3em] font-bold bg-white/30 backdrop-blur-sm px-4 py-1 rounded-full border border-black/5 hover:bg-white/80"
              >
                ← EXIT GAME
              </button>
            </div>
            <DinoGame 
              playerName={playerName} 
              onGameOver={handleGameOver} 
              autoEnableCamera={isCameraEnabled}
              onCameraReady={handleCameraReady}
            />
          </motion.div>
        )}

        {gameState === 'result' && (
          <ResultPage 
            key="result-screen"
            playerName={playerName}
            score={finalScore}
            gameId={gameId}
            onRestart={handleRestart}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;