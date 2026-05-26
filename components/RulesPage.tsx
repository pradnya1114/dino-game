import React from 'react';
import { motion } from 'motion/react';
import { Play, Camera, Dumbbell, Zap } from 'lucide-react';

interface RulesPageProps {
  onStartGame: () => void;
}

const RulesPage: React.FC<RulesPageProps> = ({ onStartGame }) => {
  const rules = [
    {
      icon: <Camera className="text-blue-500" />,
      title: "Vision Tracking",
      description: "Stand back so your whole body is visible in the camera."
    },
    {
      icon: <Dumbbell className="text-game-accent" />,
      title: "Real Jump",
      description: "Jump in real life to make the dino jump over obstacles!"
    },
    {
      icon: <Zap className="text-yellow-500" />,
      title: "Burn Calories",
      description: "Keep moving to beat your high score and stay fit."
    }
  ];

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        onStartGame();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStartGame]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white p-8 rounded-3xl shadow-2xl border-4 border-game-text max-w-md w-full text-center"
    >
      <h2 className="text-2xl font-black mb-8 uppercase tracking-tighter">How to Play</h2>
      
      <div className="space-y-6 mb-10 text-left">
        {rules.map((rule, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * idx }}
            className="flex gap-4 items-start"
          >
            <div className="p-2 bg-gray-100 rounded-lg shrink-0">
              {rule.icon}
            </div>
            <div>
              <h3 className="text-[12px] font-bold uppercase mb-1">{rule.title}</h3>
              <p className="text-[10px] text-game-text/60 font-sans leading-relaxed">
                {rule.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="p-4 bg-yellow-50 rounded-xl border-2 border-yellow-200 mb-8">
        <p className="text-[9px] text-yellow-800 font-bold uppercase">
          Tip: Ensure good lighting for best motion tracking!
        </p>
      </div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onStartGame}
        className="w-full bg-game-accent text-white p-5 rounded-xl font-press-start text-sm flex items-center justify-center gap-3 shadow-[0_6px_0_0_#cc4141] active:shadow-none active:translate-y-[2px] transition-all"
      >
        <Play size={18} fill="currentColor" />
        START JUMPING
      </motion.button>
      
      <p className="mt-6 text-[8px] text-game-text/30 font-press-start uppercase">
        Press [ENTER] to Begin
      </p>
    </motion.div>
  );
};

export default RulesPage;
