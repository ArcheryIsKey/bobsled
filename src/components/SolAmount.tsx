import React, { useState } from 'react';
import { useSolPrice } from '../utils/solPrice';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, DollarSign } from 'lucide-react';

interface SolAmountProps {
  amount: number | string | null | undefined;
  showIcon?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
  tooltipAlign?: 'center' | 'left' | 'right';
  tooltipPosition?: 'top' | 'bottom';
  children?: React.ReactNode;
}

export default function SolAmount({
  amount,
  showIcon = false,
  prefix = '',
  suffix = ' SOL',
  className = '',
  tooltipAlign = 'center',
  tooltipPosition = 'top',
  children,
}: SolAmountProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { solPrice, formatUsd } = useSolPrice();

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : typeof amount === 'number' ? amount : null;

  if (numAmount === null || isNaN(numAmount)) {
    return <span className={className}>{children || `${prefix}--${suffix}`}</span>;
  }

  const usdValueStr = formatUsd(numAmount);

  const alignClasses =
    tooltipAlign === 'left'
      ? 'left-0'
      : tooltipAlign === 'right'
      ? 'right-0'
      : 'left-1/2 -translate-x-1/2';

  const positionClasses =
    tooltipPosition === 'bottom'
      ? 'top-full mt-2'
      : 'bottom-full mb-2';

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        // Toggle on touch devices
        e.stopPropagation();
        setIsHovered((prev) => !prev);
      }}
      className="relative inline-flex items-center cursor-help group/sol"
    >
      <span className={`inline-flex items-center gap-1 transition-colors ${className}`}>
        {showIcon && <Coins size={13} className="text-velocity-red shrink-0" />}
        {children ? children : `${prefix}${numAmount}${suffix}`}
      </span>

      {/* Floating Real-Time USD Tooltip */}
      <AnimatePresence>
        {isHovered && usdValueStr && (
          <motion.div
            initial={{ opacity: 0, y: tooltipPosition === 'bottom' ? -4 : 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: tooltipPosition === 'bottom' ? -4 : 4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-[200] ${positionClasses} ${alignClasses} pointer-events-none whitespace-nowrap`}
          >
            <div className="bg-[#121212]/95 backdrop-blur-xl border border-white/20 px-3 py-1.5 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.9)] flex flex-col items-center gap-0.5 font-mono text-center">
              <div className="flex items-center gap-1 text-emerald-400 font-bold text-xs">
                <DollarSign size={11} className="-mr-0.5" />
                <span>≈ {usdValueStr} USD</span>
              </div>
              {solPrice && (
                <div className="text-[9px] text-text-muted">
                  @ ${solPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/SOL
                </div>
              )}
              {/* Tooltip caret */}
              <div
                className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-[#121212] border-r border-b border-white/20 rotate-45 ${
                  tooltipPosition === 'bottom' ? '-top-1 border-r-0 border-b-0 border-l border-t' : '-bottom-1'
                }`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
