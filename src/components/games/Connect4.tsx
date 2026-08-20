import { useState } from 'react';
import { motion } from 'framer-motion';

const ROWS = 6;
const COLS = 7;

function checkWin(board: number[], player: number, r: number, c: number) {
  const checkLine = (dr: number, dc: number) => {
    let count = 0;
    for (let i = -3; i <= 3; i++) {
      const nr = r + i * dr;
      const nc = c + i * dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr * COLS + nc] === player) {
        count++;
        if (count >= 4) return true;
      } else {
        count = 0;
      }
    }
    return false;
  };

  return (
    checkLine(1, 0) || // Vertical
    checkLine(0, 1) || // Horizontal
    checkLine(1, 1) || // Diagonal down-right
    checkLine(1, -1)   // Diagonal down-left
  );
}

interface Connect4Props {
  game: any;
  user: any;
  isSpectator: boolean;
  onMove: (newBoard: number[], winner: string | null) => void;
}

export default function Connect4({ game, user, isSpectator, onMove }: Connect4Props) {
  const [hoverColumn, setHoverColumn] = useState<number | null>(null);

  const isMyTurn = !isSpectator && game.turn === user?.id && game.status === 'active';
  const isPlayer1 = user?.id === game.player1;
  const myPlayerNumber = isPlayer1 ? 1 : 2;

  const handleDrop = (colIndex: number) => {
    if (game.status !== 'active' || isSpectator || !isMyTurn) return;

    const newBoard = [...game.board];
    
    // Find the bottom-most empty slot (Row 5 is bottom, Row 0 is top)
    let emptyRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (newBoard[r * COLS + colIndex] === 0) {
        emptyRow = r;
        break;
      }
    }
    if (emptyRow === -1) return; // Column is full

    newBoard[emptyRow * COLS + colIndex] = myPlayerNumber;

    const isWin = checkWin(newBoard, myPlayerNumber, emptyRow, colIndex);
    const isDraw = !isWin && newBoard.every((cell) => cell !== 0);

    let winner = null;
    if (isWin) {
      winner = user?.id;
    } else if (isDraw) {
      winner = 'draw';
    }

    onMove(newBoard, winner);
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Board Container */}
      <div className="rounded-2xl p-4 sm:p-6 md:p-8 w-full max-w-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.8)] relative bg-[#141414]">
        
        {/* Floating Turn Indicator Pill */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20">
          {game.status === 'active' ? (
            isMyTurn ? (
              <div className="bg-velocity-red text-white px-5 py-1.5 rounded-full text-xs tracking-wider shadow-[0_0_20px_rgba(255,77,77,0.7)] flex items-center gap-2 font-bold uppercase font-mono">
                <span className="w-2 h-2 bg-white rounded-full animate-ping" />
                Your Turn
              </div>
            ) : (
              <div className="bg-[#1e1e1e] text-text-secondary border border-white/10 px-5 py-1.5 rounded-full text-xs tracking-wider flex items-center gap-2 font-semibold uppercase font-mono shadow-md">
                <span className="w-2 h-2 bg-text-muted rounded-full animate-pulse" />
                Opponent's Turn
              </div>
            )
          ) : game.status === 'waiting' ? (
            <div className="bg-[#1e1e1e] border border-velocity-red/40 text-velocity-red px-5 py-1.5 rounded-full text-xs tracking-wider flex items-center gap-2 font-semibold uppercase font-mono shadow-md">
              <span className="w-2 h-2 bg-velocity-red rounded-full animate-ping" />
              Waiting for Opponent
            </div>
          ) : (
            <div className="bg-[#1e1e1e] border border-velocity-red/50 text-velocity-red px-5 py-1.5 rounded-full text-xs tracking-wider flex items-center gap-2 font-bold uppercase font-mono shadow-[0_0_15px_rgba(255,77,77,0.3)]">
              Game Finished
            </div>
          )}
        </div>

        {/* 7 Columns x 6 Rows Board (Row 0 at top, Row 5 at bottom) */}
        <div className="bg-[#1a1a1a] rounded-xl p-2.5 sm:p-4 border border-white/10 grid grid-cols-7 gap-1.5 sm:gap-3 md:gap-3.5 mx-auto w-fit relative z-10 shadow-inner">
          {Array.from({ length: COLS }).map((_, colIndex) => (
            <div
              key={`col-${colIndex}`}
              className={`flex flex-col gap-1.5 sm:gap-3 md:gap-3.5 relative group ${
                isMyTurn ? 'cursor-pointer' : ''
              }`}
              onMouseEnter={() => isMyTurn && setHoverColumn(colIndex)}
              onMouseLeave={() => isMyTurn && setHoverColumn(null)}
              onClick={() => handleDrop(colIndex)}
            >
              {/* Column Hover Drop Marker at top */}
              {hoverColumn === colIndex && isMyTurn && (
                <div
                  className={`absolute -top-5 sm:-top-7 left-1/2 -translate-x-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full pointer-events-none transition-all ${
                    isPlayer1
                      ? 'bg-velocity-red shadow-[0_0_15px_rgba(255,77,77,0.8)]'
                      : 'bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]'
                  }`}
                />
              )}

              {/* Rows from 0 (top) down to 5 (bottom) */}
              {Array.from({ length: ROWS }).map((_, rowIndex) => {
                const cellValue = game.board[rowIndex * COLS + colIndex];
                let slotStyles =
                  'w-9 h-9 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full transition-all duration-200 flex items-center justify-center relative overflow-hidden ';

                if (cellValue === 1) {
                  slotStyles +=
                    'bg-velocity-red shadow-[0_0_15px_rgba(255,77,77,0.5),inset_0_-4px_6px_rgba(0,0,0,0.4)] border border-velocity-red/60';
                } else if (cellValue === 2) {
                  slotStyles +=
                    'bg-white shadow-[0_0_15px_rgba(255,255,255,0.5),inset_0_-4px_6px_rgba(0,0,0,0.4)] border border-white/60';
                } else {
                  slotStyles +=
                    'bg-[#0d0d0d] shadow-[inset_0_3px_6px_rgba(0,0,0,0.8)] border border-white/5 ' +
                    (isMyTurn ? 'group-hover:bg-white/5' : '');
                }

                return (
                  <div key={`cell-${rowIndex}-${colIndex}`} className={slotStyles}>
                    {cellValue !== 0 && (
                      <motion.div
                        initial={{ y: -(rowIndex + 1) * 70, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ type: 'spring', damping: 14, stiffness: 140 }}
                        className="w-full h-full rounded-full"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Board Stand / Base */}
        <div className="w-[92%] mx-auto h-3 sm:h-4 bg-[#202020] rounded-b-xl mt-1 border-b border-l border-r border-white/10 relative z-10 shadow-lg" />
      </div>
    </div>
  );
}
