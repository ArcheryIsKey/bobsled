import React, { useState, useRef } from 'react';
import { Loader2, CheckCircle, ArrowRight, Plus, X } from 'lucide-react';
import { processImageFile } from '../utils/image';

interface SetUsernameScreenProps {
  onSubmit: (username: string, avatarUrl?: string) => void;
  isSubmitting: boolean;
  error: string | null;
}

export default function SetUsernameScreen({ onSubmit, isSubmitting, error }: SetUsernameScreenProps) {
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingAvatar(true);
    try {
      const dataUrl = await processImageFile(file, 256, 0.85);
      setAvatarUrl(dataUrl);
    } catch (err) {
      console.error('Failed to process avatar:', err);
      alert('Could not process this image. Please try another one.');
    } finally {
      setIsProcessingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAvatarUrl(null);
  };

  return (
    <div className="bg-surface-base text-text-primary min-h-screen flex flex-col font-body-md relative overflow-hidden w-full">
      {/* Background Atmospheric Effect */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-velocity-red/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-surface-elevated/20 rounded-full blur-[100px]" />
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarChange}
        accept="image/*"
        className="hidden"
      />

      <main className="flex-grow flex items-center justify-center p-margin-mobile md:p-margin-desktop relative z-10 w-full max-w-max-width mx-auto py-12">
        <div className="bg-[rgba(26,26,26,0.85)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.1)] shadow-[0_4px_30px_rgba(0,0,0,0.5)] rounded-xl w-full max-w-md overflow-hidden transition-all duration-300">
          {/* Progress Bar Header */}
          <div className="w-full bg-surface-container-highest h-1">
            <div className="bg-velocity-red h-full w-1/3 transition-all duration-500 ease-out" role="progressbar" />
          </div>

          <form
            className="p-8 flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (username.trim()) onSubmit(username.trim(), avatarUrl || undefined);
            }}
          >
            {/* Branding & Title */}
            <div className="text-center space-y-1">
              <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-text-primary font-bold tracking-tight">
                Claim Your Identity
              </h1>
              <p className="font-body-sm text-body-sm text-text-secondary">
                Your pilot profile on the bobsled.gg network.
              </p>
            </div>

            {/* Avatar Upload (Blank square with plus sign) */}
            <div className="flex flex-col items-center gap-2 pt-2">
              <label className="font-label-caps text-[11px] text-text-muted uppercase tracking-wider block">
                Profile Avatar
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-glass-border hover:border-velocity-red bg-surface-container hover:bg-surface-container-high transition-all flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group shadow-inner"
                title="Upload Profile Picture"
              >
                {avatarUrl ? (
                  <>
                    <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="font-label-caps text-[10px] text-white uppercase">Change</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center hover:bg-velocity-red transition-colors"
                      title="Remove avatar"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : isProcessingAvatar ? (
                  <Loader2 size={24} className="animate-spin text-velocity-red" />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 p-2 text-center">
                    <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center text-text-muted group-hover:text-velocity-red group-hover:bg-velocity-red/10 transition-colors">
                      <Plus size={18} />
                    </div>
                    <span className="font-label-caps text-[9px] text-text-muted group-hover:text-text-primary uppercase tracking-wider transition-colors">
                      Add Photo
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Username Input Area */}
            <div className="space-y-3">
              <label className="font-label-caps text-label-caps text-text-muted uppercase block" htmlFor="username">
                Callsign / Username
              </label>
              <div className="relative flex items-center bg-surface-container rounded border-b border-glass-border transition-colors duration-200 focus-within:border-velocity-red focus-within:shadow-[0_1px_0_var(--color-velocity-red)]">
                <span className="pl-4 font-body-md text-body-md text-text-muted select-none">@</span>
                <input
                  autoComplete="off"
                  className="w-full bg-transparent border-none text-text-primary font-body-md text-body-md py-3 px-3 focus:ring-0 placeholder-surface-container-high outline-none"
                  id="username"
                  name="username"
                  placeholder="pilot_zero"
                  spellCheck="false"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={15}
                />
                {/* Status Icon */}
                {username.length > 3 && !error && (
                  <div className="pr-4" id="status-icon">
                    <CheckCircle className="text-text-muted w-5 h-5" />
                  </div>
                )}
              </div>

              {/* Helper Text / Validation Message */}
              <div className="flex justify-between items-center min-h-[20px]">
                {error ? (
                  <p className="font-body-sm text-body-sm text-velocity-red">{error}</p>
                ) : (
                  <p className="font-body-sm text-body-sm text-text-secondary" id="username-helper">
                    4-15 characters, alphanumeric and underscores.
                  </p>
                )}
                {username.length > 3 && !error && (
                  <span className="font-label-caps text-label-caps text-text-muted">AVAILABLE</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-glass-border">
              <button
                className="w-full bg-velocity-red text-text-primary font-label-caps text-label-caps uppercase py-4 rounded font-bold tracking-wider hover:bg-primary-container active:scale-[0.98] transition-all duration-200 flex justify-center items-center gap-2 group disabled:opacity-50"
                type="submit"
                disabled={!username.trim() || isSubmitting || username.length < 4}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Initializing Pilot...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Arena</span>
                    <ArrowRight className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform duration-300" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
