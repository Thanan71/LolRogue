import { useEffect, useRef } from 'react';
import { initGame } from './game';
import { useGameStore } from './stores/gameStore';
import { StarterSelect } from './components/StarterSelect';
import './styles/starter-select.css';

export default function App() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);
  const phase = useGameStore((s) => s.phase);

  useEffect(() => {
    if (gameContainerRef.current && !gameInstanceRef.current) {
      gameInstanceRef.current = initGame(gameContainerRef.current);
    }

    return () => {
      if (gameInstanceRef.current) {
        gameInstanceRef.current.destroy(true);
        gameInstanceRef.current = null;
      }
    };
  }, []);

  if (phase === 'starterSelect') {
    return (
      <div id="app">
        <StarterSelect />
      </div>
    );
  }

  return (
    <div id="app">
      <div id="game-container" ref={gameContainerRef} />
    </div>
  );
}
