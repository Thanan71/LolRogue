import { useEffect, useRef } from 'react';
import { initGame } from './game';

export default function App() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);

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

  return (
    <div id="app">
      <div id="game-container" ref={gameContainerRef} />
    </div>
  );
}
