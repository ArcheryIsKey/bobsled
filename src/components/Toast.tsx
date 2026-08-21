import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useGameStore, type ToastItem } from '../store';

const ICON_MAP: Record<ToastItem['type'], typeof Info> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLOR_MAP: Record<ToastItem['type'], string> = {
  success: 'border-emerald-500/40 bg-emerald-950/80 text-emerald-300',
  error: 'border-red-500/40 bg-red-950/80 text-red-300',
  warning: 'border-amber-500/40 bg-amber-950/80 text-amber-300',
  info: 'border-white/20 bg-[#1a1a1a]/90 text-white',
};

const ICON_COLOR_MAP: Record<ToastItem['type'], string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-white/70',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useGameStore();

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = ICON_MAP[toast.type];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] font-mono text-xs ${COLOR_MAP[toast.type]}`}
            >
              <Icon size={16} className={`shrink-0 mt-0.5 ${ICON_COLOR_MAP[toast.type]}`} />
              <span className="flex-1 leading-relaxed">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-0.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
