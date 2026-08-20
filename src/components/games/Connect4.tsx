import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronDown } from 'lucide-react';

const ROWS = 6;
const COLS = 7;

function findWinningCells(board: number[]): number[] {
  const checkLine = (r: number, c: number, dr: number, dc: number): number[] | null => {
    const player = board[r * COLS + c];
    if (player === 0) return null;
    const cells = [r * COLS + c];
    for (let step = 1; step < 4; step++) {
      const nr = r + step * dr;
      const nc = c + step * dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return null;
      if (board[nr * COLS + nc] !== player) return null;
      cells.push(nr * COLS + nc);
    }
    return cells;
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // Horizontal
      const horiz = checkLine(r, c, 0, 1);
      if (horiz) return horiz;
      // Vertical
      const vert = checkLine(r, c, 1, 0);
      if (vert) return vert;
      // Diagonal down-right
      const diagDR = checkLine(r, c, 1, 1);
      if (diagDR) return diagDR;
      // Diagonal down-left
      const diagDL = checkLine(r, c, 1, -1);
      if (diagDL) return diagDL;
    }
  }
  return [];
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

  // Calculate winning cells if match is finished
  const winningIndices = useMemo(() => {
    if (game.status === 'finished' && game.winner && game.winner !== 'draw') {
      return findWinningCells(game.board);
    }
    return [];
  }, [game.status, game.winner, game.board]);

  const winningSet = useMemo(() => new Set(winningIndices), [winningIndices]);

  // Compute landing row for hovered column preview
  const hoverLandingRow = useMemo(() => {
    if (hoverColumn === null || !isMyTurn) return -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (game.board[r * COLS + hoverColumn] === 0) {
        return r;
      }
    }
    return -1;
  }, [hoverColumn, isMyTurn, game.board]);

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

    const winCells = findWinningCells(newBoard);
    const isWin = winCells.length >= 4;
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
      <div className="rounded-3xl p-4 sm:p-6 md:p-8 w-full max-w-2xl border border-white/10 shadow-[0_16px_50px_rgba(0,0,0,0.85)] relative bg-[#141414] overflow-visible">
        
        {/* Floating Turn Indicator Pill */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30">
          {game.status === 'active' ? (
            isMyTurn ? (
              <motion.div
                initial={{ scale: 0.9, y: -2 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-velocity-red text-white px-5 py-1.5 rounded-full text-xs tracking-wider shadow-[0_0_25px_rgba(255,77,77,0.75)] flex items-center gap-2 font-bold uppercase font-mono"
              >
                <span className="w-2 h-2 bg-white rounded-full animate-ping" />
                <span>Your Turn</span>
              </motion.div>
            ) : (
              <div className="bg-[#1e1e1e] text-text-secondary border border-white/10 px-5 py-1.5 rounded-full text-xs tracking-wider flex items-center gap-2 font-semibold uppercase font-mono shadow-md">
                <span className="w-2 h-2 bg-text-muted rounded-full animate-pulse" />
                <span>Opponent's Turn</span>
              </div>
            )
          ) : game.status === 'waiting' ? (
            <div className="bg-[#1e1e1e] border border-velocity-red/40 text-velocity-red px-5 py-1.5 rounded-full text-xs tracking-wider flex items-center gap-2 font-semibold uppercase font-mono shadow-md">
              <span className="w-2 h-2 bg-velocity-red rounded-full animate-ping" />
              <span>Waiting for Opponent</span>
            </div>
          ) : (
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="bg-[#1e1e1e] border border-velocity-red/60 text-velocity-red px-5 py-1.5 rounded-full text-xs tracking-wider flex items-center gap-2 font-bold uppercase font-mono shadow-[0_0_20px_rgba(255,77,77,0.4)]"
            >
              <Sparkles size={13} className="text-velocity-red animate-spin" />
              <span>{game.winner === 'draw' ? 'Match Draw' : 'Match Finished'}</span>
            </motion.div>
          )}
        </div>

        {/* 7 Columns x 6 Rows Board Container */}
        <div className="bg-[#181818] rounded-2xl p-3 sm:p-5 border border-white/10 grid grid-cols-7 gap-1.5 sm:gap-3 md:gap-3.5 mx-auto w-fit relative z-10 shadow-[inset_0_4px_20px_rgba(0,0,0,0.8)] overflow-visible">
          {Array.from({ length: COLS }).map((_, colIndex) => {
            const isColHovered = hoverColumn === colIndex && isMyTurn;

            return (
              <div
                key={`col-${colIndex}`}
                className={`flex flex-col gap-1.5 sm:gap-3 md:gap-3.5 relative group overflow-visible ${
                  isMyTurn ? 'cursor-pointer' : ''
                }`}
                onMouseEnter={() => isMyTurn && setHoverColumn(colIndex)}
                onMouseLeave={() => isMyTurn && setHoverColumn(null)}
                onClick={() => handleDrop(colIndex)}
              >
                {/* Column Hover Drop Marker Arrow */}
                <AnimatePresence>
                  {isColHovered && (
                    <motion.div
                      initial={{ y: -10, opacity: 0 }}
                      animate={{ y: [0, -6, 0], opacity: 1 }}
                      exit={{ y: -8, opacity: 0 }}
                      transition={{ y: { repeat: Infinity, duration: 0.6, ease: 'easeInOut' } }}
                      className={`absolute -top-7 sm:-top-9 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none ${
                        isPlayer1 ? 'text-velocity-red' : 'text-white'
                      }`}
                    >
                      <ChevronDown size={20} className="drop-shadow-[0_0_10px_currentColor]" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Rows from 0 (top) down to 5 (bottom) */}
                {Array.from({ length: ROWS }).map((_, rowIndex) => {
                  const cellIndex = rowIndex * COLS + colIndex;
                  const cellValue = game.board[cellIndex];
                  const isWinningCell = winningSet.has(cellIndex);
                  const isFinishedWithWinner = winningIndices.length > 0;
                  const isDimmed = isFinishedWithWinner && !isWinningCell;

                  const isGhostSlot = isColHovered && hoverLandingRow === rowIndex && cellValue === 0;

                  // Dynamic top-of-board drop distance based on row index
                  const dropDistance = -((rowIndex + 2.5) * 70);

                  return (
                    <div
                      key={`cell-${rowIndex}-${colIndex}`}
                      className="w-9 h-9 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center relative bg-[#0c0c0c] shadow-[inset_0_3px_8px_rgba(0,0,0,0.9),0_1px_1px_rgba(255,255,255,0.05)] border border-white/5 overflow-visible"
                    >
                      {/* Ghost Landing Preview Disc */}
                      {isGhostSlot && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 0.55, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className={`w-full h-full rounded-full border-2 border-dashed ${
                            isPlayer1
                              ? 'border-velocity-red bg-velocity-red/20 shadow-[0_0_12px_rgba(255,77,77,0.3)]'
                              : 'border-white bg-white/20 shadow-[0_0_12px_rgba(255,255,255,0.3)]'
                          }`}
                        />
                      )}

                      {/* Placed Disc with Physics Drop from Above the Board */}
                      {cellValue !== 0 && (
                        <motion.div
                          initial={{
                            y: dropDistance,
                            opacity: 1,
                            scaleY: 1.25,
                            scaleX: 0.85,
                          }}
                          animate={{
                            y: 0,
                            opacity: 1,
                            scaleY: [1.25, 0.8, 1.1, 0.95, 1],
                            scaleX: [0.85, 1.15, 0.95, 1.03, 1],
                          }}
                          transition={{
                            y: {
                              type: 'spring',
                              damping: 13,
                              stiffness: 180,
                              mass: 0.8,
                            },
                            scaleY: {
                              duration: 0.55,
                              times: [0, 0.5, 0.7, 0.85, 1],
                              ease: 'easeOut',
                            },
                            scaleX: {
                              duration: 0.55,
                              times: [0, 0.5, 0.7, 0.85, 1],
                              ease: 'easeOut',
                            },
                          }}
                          className={`w-full h-full rounded-full flex items-center justify-center relative transition-all duration-300 z-10 ${
                            isDimmed ? 'opacity-35 scale-95 grayscale-[40%]' : 'opacity-100'
                          } ${
                            cellValue === 1
                              ? 'bg-[radial-gradient(circle_at_35%_35%,_#ff6666_0%,_#e60000_65%,_#990000_100%)] shadow-[0_0_16px_rgba(255,77,77,0.6),inset_0_-3px_5px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.4)] border border-red-400/40'
                              : 'bg-[radial-gradient(circle_at_35%_35%,_#ffffff_0%,_#dddddd_65%,_#999999_100%)] shadow-[0_0_16px_rgba(255,255,255,0.5),inset_0_-3px_5px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.8)] border border-white/80'
                          }`}
                        >
                          {/* Inner 3D Grooved Ring */}
                          <div className="w-[60%] h-[60%] rounded-full border border-black/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)] flex items-center justify-center pointer-events-none">
                            {/* Winning Four-In-A-Row Spark Icon */}
                            {isWinningCell && (
                              <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{
                                  scale: [1, 1.25, 1],
                                  opacity: [0.8, 1, 0.8],
                                }}
                                transition={{
                                  repeat: Infinity,
                                  duration: 1.1,
                                  ease: 'easeInOut',
                                }}
                                className="w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_15px_#ffffff] flex items-center justify-center"
                              >
                                <Sparkles size={11} className={cellValue === 1 ? 'text-velocity-red' : 'text-black'} />
                              </motion.div>
                            )}
                          </div>

                          {/* Outer Pulsing Aura for Winning Discs */}
                          {isWinningCell && (
                            <motion.div
                              animate={{
                                boxShadow: [
                                  cellValue === 1
                                    ? '0 0 10px 2px rgba(255,77,77,0.8)'
                                    : '0 0 10px 2px rgba(255,255,255,0.8)',
                                  cellValue === 1
                                    ? '0 0 25px 6px rgba(255,77,77,1)'
                                    : '0 0 25px 6px rgba(255,255,255,1)',
                                  cellValue === 1
                                    ? '0 0 10px 2px rgba(255,77,77,0.8)'
                                    : '0 0 10px 2px rgba(255,255,255,0.8)',
                                ],
                              }}
                              transition={{ repeat: Infinity, duration: 1.2 }}
                              className="absolute inset-0 rounded-full border-2 border-white pointer-events-none"
                            />
                          )}
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Board Stand / Base */}
        <div className="w-[94%] mx-auto h-3.5 sm:h-4 bg-[#1f1f1f] rounded-b-2xl mt-1 border-b border-l border-r border-white/10 relative z-10 shadow-2xl flex items-center justify-center">
          <div className="w-16 h-1 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}
