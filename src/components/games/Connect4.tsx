import { useState } from 'react';
import { motion } from 'framer-motion';

const ROWS = 6;
const COLS = 7;

// Logic for connect 4 checking
function checkWin(board: number[], player: number, r: number, c: number) {
  const checkLine = (dr: number, dc: number) => {
    let count = 0;
    for (let i = -3; i <= 3; i++) {
      const nr = r + i * dr;
      const nc = c + i * dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr * COLS + nc] === player) {
        count++;
        if (count === 4) return true;
      } else {
        count = 0;
      }
    }
    return false;
  };

  return checkLine(1, 0) || checkLine(0, 1) || checkLine(1, 1) || checkLine(1, -1);
}

interface Connect4Props {
  game: any;
  user: any;
  isSpectator: boolean;
  onMove: (newBoard: number[], winner: string | null) => void;
}

export default function Connect4({ game, user, isSpectator, onMove }: Connect4Props) {
  const [hoverColumn, setHoverColumn] = useState<number | null>(null);

  const isMyTurn = !isSpectator && game.turn === user?.id;
  const isPlayer1 = user?.id === game.player1;
  const myPlayerNumber = isPlayer1 ? 1 : 2;

  const handleDrop = (colIndex: number) => {
    if (game.status !== 'active' || isSpectator || !isMyTurn) return;

    const newBoard = [...game.board];
    let emptyRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (newBoard[r * COLS + colIndex] === 0) {
        emptyRow = r;
        break;
      }
    }
    if (emptyRow === -1) return; // Column full

    newBoard[emptyRow * COLS + colIndex] = myPlayerNumber;
    
    // Check win condition locally before writing to DB
    const isWin = checkWin(newBoard, myPlayerNumber, emptyRow, colIndex);
    const isDraw = !isWin && newBoard.every(cell => cell !== 0);

    let winner = null;
    if (isWin) {
      winner = user?.id;
    } else if (isDraw) {
      winner = 'draw';
    }

    onMove(newBoard, winner);
  };

  return (
    <div className="bg-neutral-900 p-4 sm:p-8 rounded-xl shadow-2xl border border-neutral-800 relative z-10 scale-[0.8] sm:scale-100 origin-center mt-12">
      <div className="grid grid-cols-7 gap-2 sm:gap-4">
        {Array.from({ length: COLS }).map((_, colIndex) => (
          <div 
            key={`col-${colIndex}`}
            className={`flex flex-col-reverse gap-2 sm:gap-4 relative ${!isSpectator && isMyTurn ? 'cursor-pointer' : ''}`}
            onMouseEnter={() => !isSpectator && setHoverColumn(colIndex)}
            onMouseLeave={() => !isSpectator && setHoverColumn(null)}
            onClick={() => !isSpectator && handleDrop(colIndex)}
          >
            {/* Hover Indicator */}
            {hoverColumn === colIndex && isMyTurn && game.status === 'active' && (
              <div className={`absolute -top-6 sm:-top-10 left-1/2 -translate-x-1/2 w-3 h-3 sm:w-4 sm:h-4 rounded-full ${isPlayer1 ? 'bg-[#14F195] shadow-[0_0_15px_rgba(20,241,149,0.5)]' : 'bg-[#AB9FF2] shadow-[0_0_15px_rgba(171,159,242,0.5)]'}`} />
            )}
            
            {Array.from({ length: ROWS }).map((_, rowIndex) => {
              const cellValue = game.board[rowIndex * COLS + colIndex];
              return (
                <div key={`cell-${rowIndex}-${colIndex}`} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-neutral-800 bg-neutral-950 shadow-inner relative flex items-center justify-center">
                  {cellValue === 1 && <motion.div initial={{ y: -300 }} animate={{ y: 0 }} transition={{ type: "spring", bounce: 0.4 }} className="w-[85%] h-[85%] rounded-full bg-[#14F195] shadow-lg shadow-[#14F195]/20" />}
                  {cellValue === 2 && <motion.div initial={{ y: -300 }} animate={{ y: 0 }} transition={{ type: "spring", bounce: 0.4 }} className="w-[85%] h-[85%] rounded-full bg-[#AB9FF2] shadow-lg shadow-[#AB9FF2]/20" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
