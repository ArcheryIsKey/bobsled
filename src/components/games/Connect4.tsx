import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle, CaretDown, CircleNotch, WifiSlash } from '@phosphor-icons/react';
import { useNetworkStatus } from '../common/ConnectionStatusBanner';

const ROWS = 6;
const COLS = 7;

export function sanitizeBoard(rawBoard: any): number[] {
  if (Array.isArray(rawBoard) && rawBoard.length === 42) {
    return rawBoard.map((c) => (typeof c === 'number' && Number.isInteger(c) && (c === 0 || c === 1 || c === 2) ? c : 0));
  }
  return Array(42).fill(0);
}

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
  const [isMovePending, setIsMovePending] = useState(false);
  const { isOffline } = useNetworkStatus();

  // Defend board rendering with fallback sanitizer
  const safeBoard = useMemo(() => sanitizeBoard(game?.board), [game?.board]);

  const isMyTurn = !isSpectator && game?.turn === user?.id && game?.status === 'active' && !isOffline;
  const isPlayer1 = user?.id === game?.player1;
  const myPlayerNumber = isPlayer1 ? 1 : 2;

  const p1IsRed = game?.player1Color !== 'white';
  const myDiscIsRed = isPlayer1 ? p1IsRed : !p1IsRed;
  const isDiscRed = (val: number) => (p1IsRed ? val === 1 : val === 2);

  // Reset optimistic move lock whenever turn changes or board updates
  useEffect(() => {
    setIsMovePending(false);
  }, [game?.turn, game?.board]);

  // Calculate winning cells if match is finished
  const winningIndices = useMemo(() => {
    if (game?.status === 'finished' && game?.winner && game?.winner !== 'draw') {
      return findWinningCells(safeBoard);
    }
    return [];
  }, [game?.status, game?.winner, safeBoard]);

  const winningSet = useMemo(() => new Set(winningIndices), [winningIndices]);

  // Compute landing row for hovered column preview
  const hoverLandingRow = useMemo(() => {
    if (hoverColumn === null || !isMyTurn || isMovePending) return -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (safeBoard[r * COLS + hoverColumn] === 0) {
        return r;
      }
    }
    return -1;
  }, [hoverColumn, isMyTurn, isMovePending, safeBoard]);

  const handleDrop = (colIndex: number) => {
    if (game?.status !== 'active' || isSpectator || !isMyTurn || isMovePending || isOffline) return;

    // Optimistic move locking to prevent double-clicks or race conditions
    setIsMovePending(true);

    const newBoard = [...safeBoard];
    
    // Find the bottom-most empty slot (Row 5 is bottom, Row 0 is top)
    let emptyRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (newBoard[r * COLS + colIndex] === 0) {
        emptyRow = r;
        break;
      }
    }
    if (emptyRow === -1) {
      setIsMovePending(false);
      return; // Column is full
    }

    newBoard[emptyRow * COLS + colIndex] = myPlayerNumber;

    const winCells = findWinningCells(newBoard);
    const isWin = winCells.length >= 4;
    const isDraw = !isWin && newBoard.every((cell) => cell !== 0);

    let winner: string | null = null;
    if (isWin) {
      winner = user?.id || null;
    } else if (isDraw) {
      winner = 'draw';
    }

    try {
      onMove(newBoard, winner);
    } catch {
      setIsMovePending(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Board Container - Responsive & Optimized for Mobile Screens */}
      <div className="bg-[#121212] px-2.5 sm:px-5 md:px-6 pb-2.5 sm:pb-5 md:pb-6 pt-0 rounded-2xl sm:rounded-3xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative w-full max-w-2xl overflow-visible">
        
        {/* Subtle Top Accent Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[2px] bg-gradient-to-r from-transparent via-velocity-red to-transparent opacity-80" />

        {/* Turn & Status Header - Perfectly Vertically Centered */}
        <div className="w-full flex items-center justify-center py-3.5 sm:py-4 px-1 sm:px-2">
          {game?.status === 'active' ? (
            isOffline ? (
              <div className="bg-red-950/40 border border-red-500/40 text-red-300 px-4 sm:px-5 py-1.5 rounded-full text-[11px] sm:text-xs tracking-wider flex items-center justify-center gap-2 font-mono shadow-md whitespace-nowrap leading-none">
                <WifiSlash size={14} className="text-red-400 animate-pulse" />
                <span>Offline — Moves Paused</span>
              </div>
            ) : isMovePending ? (
              <div className="bg-[#1e1e1e] border border-primary/40 text-primary px-4 sm:px-5 py-1.5 rounded-full text-[11px] sm:text-xs tracking-wider flex items-center justify-center gap-2 font-mono shadow-md whitespace-nowrap leading-none">
                <CircleNotch size={14} className="animate-spin text-primary shrink-0" />
                <span>Submitting Move...</span>
              </div>
            ) : isSpectator ? (
              <div className="bg-[#1e1e1e] border border-white/10 text-text-secondary px-4 sm:px-5 py-1.5 rounded-full text-[11px] sm:text-xs tracking-wider flex items-center justify-center gap-2 font-mono shadow-sm leading-none">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                <span>Spectating Live Game</span>
              </div>
            ) : isMyTurn ? (
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className={`border px-4 sm:px-5 py-1.5 rounded-full text-[11px] sm:text-xs tracking-wider flex items-center justify-center gap-2 font-bold uppercase font-mono whitespace-nowrap shadow-md leading-none ${
                  myDiscIsRed
                    ? 'bg-primary/15 border-primary text-primary shadow-[0_0_20px_rgba(255,77,77,0.4)]'
                    : 'bg-white/15 border-white text-white shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full animate-ping shrink-0 ${myDiscIsRed ? 'bg-primary' : 'bg-white'}`} />
                <span>Your Turn to Move ({myDiscIsRed ? 'Red' : 'White'})</span>
              </motion.div>
            ) : (
              <div className="bg-[#1a1a1a] border border-white/10 text-text-muted px-4 sm:px-5 py-1.5 rounded-full text-[11px] sm:text-xs tracking-wider flex items-center justify-center gap-2 font-semibold uppercase font-mono shadow-sm whitespace-nowrap leading-none">
                <span className="w-2 h-2 bg-text-muted rounded-full animate-pulse shrink-0" />
                <span>Opponent's Turn ({myDiscIsRed ? 'White' : 'Red'})</span>
              </div>
            )
          ) : game?.status === 'waiting' ? (
            <div className="bg-[#1e1e1e] border border-primary/40 text-primary px-4 sm:px-5 py-1.5 rounded-full text-[11px] sm:text-xs tracking-wider flex items-center justify-center gap-2 font-semibold uppercase font-mono shadow-md whitespace-nowrap leading-none">
              <span className="w-2 h-2 bg-primary rounded-full animate-ping shrink-0" />
              <span>Waiting for Opponent</span>
            </div>
          ) : (
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="bg-[#1e1e1e] border border-primary/60 text-primary px-4 sm:px-5 py-1.5 rounded-full text-[11px] sm:text-xs tracking-wider flex items-center justify-center gap-2 font-bold uppercase font-mono shadow-[0_0_20px_rgba(255,77,77,0.4)] whitespace-nowrap leading-none"
            >
              <Sparkle size={13} className="text-primary animate-spin shrink-0" />
              <span>{game?.winner === 'draw' ? 'Match Draw' : 'Match Finished'}</span>
            </motion.div>
          )}
        </div>

        {/* 7 Columns x 6 Rows Board Container - Large Touch Targets for Mobile */}
        <div className="bg-[#181818] rounded-xl sm:rounded-2xl p-2 min-[380px]:p-3 sm:p-5 border border-white/10 grid grid-cols-7 gap-1 min-[380px]:gap-1.5 sm:gap-3 md:gap-3.5 mx-auto w-fit relative z-10 shadow-[inset_0_4px_20px_rgba(0,0,0,0.8)] overflow-visible select-none">
          {Array.from({ length: COLS }).map((_, colIndex) => {
            const isColHovered = hoverColumn === colIndex && isMyTurn && !isMovePending && !isOffline;

            return (
              <div
                key={`col-${colIndex}`}
                className={`flex flex-col gap-1 min-[380px]:gap-1.5 sm:gap-3 md:gap-3.5 relative group overflow-visible touch-manipulation ${
                  isMyTurn && !isMovePending && !isOffline ? 'cursor-pointer' : ''
                }`}
                onMouseEnter={() => isMyTurn && !isMovePending && !isOffline && setHoverColumn(colIndex)}
                onMouseLeave={() => setHoverColumn(null)}
                onClick={() => handleDrop(colIndex)}
              >
                {/* Column Hover Drop Marker Arrow */}
                <AnimatePresence>
                  {isColHovered && (
                    <motion.div
                      initial={{ y: -8, opacity: 0 }}
                      animate={{ y: [0, -5, 0], opacity: 1 }}
                      exit={{ y: -6, opacity: 0 }}
                      transition={{ y: { repeat: Infinity, duration: 0.6, ease: 'easeInOut' } }}
                      className={`absolute -top-6 min-[380px]:-top-7 sm:-top-9 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none ${
                        myDiscIsRed ? 'text-primary' : 'text-white'
                      }`}
                    >
                      <CaretDown size={18} className="drop-shadow-[0_0_8px_currentColor]" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Rows from 0 (top) down to 5 (bottom) - Sized for Mobile Comfort */}
                {Array.from({ length: ROWS }).map((_, rowIndex) => {
                  const cellIndex = rowIndex * COLS + colIndex;
                  const cellValue = safeBoard[cellIndex];
                  const isWinningCell = winningSet.has(cellIndex);
                  const isFinishedWithWinner = winningIndices.length > 0;
                  const isDimmed = isFinishedWithWinner && !isWinningCell;

                  const isGhostSlot = isColHovered && hoverLandingRow === rowIndex && cellValue === 0;

                  // Distance from above the board down to this row
                  const dropY = `${-((rowIndex + 1.25) * 100)}%`;
                  const cellIsRed = isDiscRed(cellValue);

                  return (
                    <div
                      key={`cell-${rowIndex}-${colIndex}`}
                      className="w-10 h-10 min-[370px]:w-11 min-[370px]:h-11 min-[410px]:w-12 min-[410px]:h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center relative bg-[#0c0c0c] shadow-[inset_0_3px_8px_rgba(0,0,0,0.9),0_1px_1px_rgba(255,255,255,0.05)] border border-white/5 overflow-visible"
                    >
                      {/* Ghost Landing Preview Disc */}
                      {isGhostSlot && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 0.45, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className={`w-full h-full rounded-full border-2 border-dashed ${
                            myDiscIsRed
                              ? 'border-primary bg-primary/20 shadow-[0_0_10px_rgba(255,77,77,0.3)]'
                              : 'border-white bg-white/20 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
                          }`}
                        />
                      )}

                      {/* Placed Disc with Physics Drop from Above the Board */}
                      {cellValue !== 0 && (
                        <motion.div
                          key={`disc-${cellValue}`}
                          initial={{ y: dropY }}
                          animate={{ y: 0 }}
                          transition={{
                            type: 'spring',
                            stiffness: 460,
                            damping: 32,
                            mass: 0.75,
                          }}
                          className={`w-full h-full rounded-full flex items-center justify-center relative z-10 ${
                            isDimmed ? 'opacity-35 scale-95 grayscale-[40%] transition-opacity duration-300' : 'opacity-100'
                          } ${
                            cellIsRed
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
                                  boxShadow: [
                                    '0 0 10px #ffffff',
                                    '0 0 25px #ffffff',
                                    '0 0 10px #ffffff',
                                  ],
                                }}
                                transition={{
                                  repeat: Infinity,
                                  duration: 1.1,
                                  ease: 'easeInOut',
                                }}
                                className="w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_15px_#ffffff] flex items-center justify-center"
                              >
                                <Sparkle size={11} className={cellIsRed ? 'text-primary' : 'text-black'} />
                              </motion.div>
                            )}
                          </div>

                          {/* Outer Pulsing Aura for Winning Discs */}
                          {isWinningCell && (
                            <motion.div
                              animate={{
                                boxShadow: [
                                  cellIsRed
                                    ? '0 0 10px rgba(255,77,77,0.5)'
                                    : '0 0 10px rgba(255,255,255,0.5)',
                                  cellIsRed
                                    ? '0 0 30px rgba(255,77,77,1)'
                                    : '0 0 30px rgba(255,255,255,1)',
                                  cellIsRed
                                    ? '0 0 10px rgba(255,77,77,0.5)'
                                    : '0 0 10px rgba(255,255,255,0.5)',
                                ],
                              }}
                              transition={{
                                repeat: Infinity,
                                duration: 1.1,
                                ease: 'easeInOut',
                              }}
                              className="absolute inset-0 rounded-full pointer-events-none"
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
      </div>
    </div>
  );
}
