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
    <div className="glass-panel rounded-xl p-4 md:p-8 w-full max-w-3xl border-t border-glass-border shadow-2xl relative">
      <div className="bg-surface-elevated rounded-lg p-2 md:p-4 border border-surface-bright grid grid-cols-7 gap-2 md:gap-4 mx-auto w-fit relative z-10">
        {Array.from({ length: COLS }).map((_, colIndex) => (
          <div 
            key={`col-${colIndex}`}
            className={`flex flex-col-reverse gap-2 md:gap-4 relative ${!isSpectator && isMyTurn ? 'cursor-pointer' : ''}`}
            onMouseEnter={() => !isSpectator && setHoverColumn(colIndex)}
            onMouseLeave={() => !isSpectator && setHoverColumn(null)}
            onClick={() => !isSpectator && handleDrop(colIndex)}
          >
            {/* Hover Indicator */}
            {hoverColumn === colIndex && isMyTurn && game.status === 'active' && (
              <div className={`absolute -top-6 md:-top-8 left-1/2 -translate-x-1/2 w-3 h-3 md:w-4 md:h-4 rounded-full ${isPlayer1 ? 'bg-velocity-red shadow-[0_0_15px_rgba(255,77,77,0.5)]' : 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.5)]'}`} />
            )}
            
            {Array.from({ length: ROWS }).map((_, rowIndex) => {
              const cellValue = game.board[rowIndex * COLS + colIndex];
              let cellClass = "w-12 h-12 md:w-16 md:h-16 rounded-full transition-all duration-300 ";
              if (cellValue === 1) {
                cellClass += "bg-velocity-red shadow-[0_0_15px_rgba(255,77,77,0.4),inset_0_-4px_6px_rgba(0,0,0,0.3)]";
              } else if (cellValue === 2) {
                cellClass += "bg-white shadow-[0_0_15px_rgba(255,255,255,0.4),inset_0_-4px_6px_rgba(0,0,0,0.3)]";
              } else {
                cellClass += "bg-background shadow-[inset_0_4px_6px_rgba(0,0,0,0.6)] " + (!isSpectator && isMyTurn ? "hover:bg-white/5" : "");
              }
              
              return (
                <div key={`cell-${rowIndex}-${colIndex}`} className={cellClass}>
                  {cellValue !== 0 && <motion.div initial={{ y: -300 }} animate={{ y: 0 }} transition={{ type: "spring", bounce: 0.4 }} className="w-full h-full rounded-full" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="w-[90%] mx-auto h-4 bg-surface-container-high rounded-b-xl mt-1 border-b border-l border-r border-glass-border relative z-10"></div>
    </div>
  );
}
