import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Trophy, RotateCcw, User } from 'lucide-react';

interface ScoreEntry {
  name: string;
  score: number;
  date: string;
  id?: number;
}

interface ResultPageProps {
  playerName: string;
  score: number;
  gameId: number;
  onRestart: () => void;
}

const ResultPage: React.FC<ResultPageProps> = ({ playerName, score, gameId, onRestart }) => {
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [isSaved, setIsSaved] = useState(false);
  const hasSavedRef = useRef(false);

  // Auto-save everyone to the leaderboard on mount
  useEffect(() => {
    // 1. Always load the latest leaderboard to display
    const savedScores = localStorage.getItem('dino_leaderboard');
    if (savedScores) {
      setLeaderboard(JSON.parse(savedScores));
    }

    // 2. Prevent double saving in Strict Mode or if component re-renders
    if (hasSavedRef.current) return;
    hasSavedRef.current = true;

    // Persist player name for next time
    localStorage.setItem('dino_player_name', playerName);
    
    // 3. Load latest scores again to be safe before pushing
    const latestScoresRaw = localStorage.getItem('dino_leaderboard');
    let scores: ScoreEntry[] = latestScoresRaw ? JSON.parse(latestScoresRaw) : [];

    const newEntry: ScoreEntry = {
      name: playerName,
      score: score,
      date: new Date().toLocaleString(),
      id: gameId,
    };
    
    // Use gameId for robust duplicate checking
    const isDuplicate = scores.some(s => s.id === gameId);

    if (!isDuplicate) {
      scores.push(newEntry);
      scores.sort((a, b) => b.score - a.score);
      scores = scores.slice(0, 4); // Keep top 4 as requested
      localStorage.setItem('dino_leaderboard', JSON.stringify(scores));
    }
    
    setLeaderboard(scores);
    setIsSaved(true);
  }, [playerName, score, onRestart]);

  const handleSave = () => {
    // Force a save update and provide feedback
    const latestScoresRaw = localStorage.getItem('dino_leaderboard');
    let scores: ScoreEntry[] = latestScoresRaw ? JSON.parse(latestScoresRaw) : [];
    
    // Update local state to show it's saved/processed
    setIsSaved(true);
    
    // Show a quick visual confirmation (could use a state for a toast)
    console.log("Data saved manually via shortcut");
  };

  const handleReset = () => {
    localStorage.removeItem('dino_leaderboard');
    setLeaderboard([]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1' || e.key === 's' || e.key === 'S') {
        handleSave();
      } else if (e.key === 'Enter') {
        handleSave();
        onRestart();
      } else if (e.key === '2') {
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playerName, score, isSaved]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-game-bg flex items-center justify-center p-4 md:p-8"
    >
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        
        {/* LEFT: Current Result */}
        <motion.div
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-game-canvas border-4 border-game-text rounded-2xl p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Trophy size={160} />
          </div>
          
          <div className="space-y-6 relative z-10">
            <div className="space-y-2">
              <span className="text-[10px] uppercase text-game-text/50 tracking-[0.2em]">Summary</span>
              <h2 className="text-2xl md:text-3xl text-game-accent uppercase tracking-tighter">Your Performance</h2>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="p-6 bg-game-bg border-4 border-game-text rounded-xl space-y-2">
                <div className="flex items-center gap-3 text-game-text/60">
                  <User size={16} />
                  <span className="text-[10px] uppercase tracking-widest">Player</span>
                </div>
                <div className="text-xl md:text-2xl break-all">{playerName}</div>
              </div>
              
              <div className="p-6 bg-game-text text-white rounded-xl space-y-1 shadow-[0_6px_0_0_#222]">
                <div className="text-[10px] uppercase tracking-widest opacity-60">Final Score</div>
                <div className="text-4xl md:text-5xl font-bold tracking-tight">
                  {score.toString().padStart(5, '0')}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 mt-8">
            <motion.div 
              animate={isSaved ? { scale: [1, 1.05, 1] } : {}}
              className="p-4 bg-green-500/0 border-0 border-green-500/20 rounded-xl flex flex-col items-center justify-center gap-1 text-green-600"
            >
               <div className="flex items-center gap-3">
                  <Trophy size={0} />
                  <span className="text-[0px] font-bold uppercase tracking-widest">
                    {isSaved ? 'All Data Saved!' : 'Saving Data...'}
                  </span>
               </div>
               <span className="text-[8px] opacity-60 uppercase font-press-start"></span>
            </motion.div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onRestart}
              className="w-full bg-game-text text-white p-5 rounded-xl font-press-start text-sm flex flex-col items-center justify-center gap-1 shadow-[0_6px_0_0_#222] active:shadow-none active:translate-y-[2px] transition-all"
            >
              <div className="flex items-center gap-3">
                <RotateCcw size={18} />
                PLAY AGAIN
              </div>
              <span className="text-[8px] opacity-60"></span>
            </motion.button>
          </div>
        </motion.div>

        {/* RIGHT: Leaderboard */}
        <motion.div
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-game-canvas border-4 border-game-text rounded-2xl p-8 shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-lg uppercase tracking-tight flex items-center gap-2">
              <Trophy size={20} className="text-yellow-500" />
              Top Jumper
            </h3>
            <span className="text-[10px] text-game-text/40"></span>
          </div>

          <div className="flex-1 space-y-3">
            {leaderboard.map((entry, index) => (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                key={`${entry.name}-${index}`}
                className={`flex items-center p-4 border-2 rounded-lg transition-all ${
                  entry.name === playerName && entry.score === score 
                    ? 'border-game-accent bg-game-accent/5' 
                    : 'border-game-text/10 bg-game-bg/30'
                }`}
              >
                <div className="w-8 text-xs font-bold text-game-text/40">#{index + 1}</div>
                <div className="flex-1 font-bold truncate pr-4 text-xs uppercase tracking-tight">
                  {entry.name}
                </div>
                <div className="text-sm font-mono font-bold text-game-accent">
                  {entry.score.toString().padStart(5, '0')}
                </div>
              </motion.div>
            ))}
            
            {leaderboard.length === 0 && (
              <div className="h-full flex items-center justify-center text-[10px] text-game-text/30 italic">
                No records yet. Be the first!
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t-2 border-dashed border-game-text/10 text-center space-y-4">
            <button 
              onClick={() => {
                localStorage.removeItem('dino_leaderboard');
                setLeaderboard([]);
              }}
              className="text-[9px] text-game-accent/60 hover:text-game-accent transition-colors uppercase font-bold"
            >
            
            </button>
            <p className="text-[8px] text-game-text/40 leading-relaxed">
              
            </p>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
};

export default ResultPage;
