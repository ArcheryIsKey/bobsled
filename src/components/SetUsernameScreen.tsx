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
      const dataUrl = await processImageFile(file, 256, 0.8);
      setAvatarUrl(dataUrl);
    } catch (err) {
      console.error('Failed to process avatar:', err);
      alert('Could not process this image. Please select a standard image file.');
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
    <div className="bg-surface-base text-text-primary min-h-[calc(100vh-64px)] flex flex-col font-body-md relative overflow-hidden w-full">
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

      <main className="flex-grow flex items-center justify-center p-4 md:p-8 relative z-10 w-full max-w-lg mx-auto py-12">
        <div className="bg-[#161616]/95 backdrop-blur-[16px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-xl w-full overflow-hidden transition-all duration-300">
          
          {/* Header Accent Line */}
          <div className="w-full bg-surface-container-highest h-1">
            <div className="bg-velocity-red h-full w-1/3 transition-all duration-500 ease-out" />
          </div>

          <form
            className="p-8 flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (username.trim()) onSubmit(username.trim(), avatarUrl || undefined);
            }}
          >
            {/* Title */}
            <div className="text-center space-y-1">
              <h1 className="font-headline-lg text-2xl md:text-3xl text-text-primary font-bold tracking-tight">
                Create Your Account
              </h1>
              <p className="font-body-sm text-text-secondary text-sm">
                Choose a username to display on matches and leaderboards.
              </p>
            </div>

            {/* Avatar Upload (Blank square with plus sign) */}
            <div className="flex flex-col items-center gap-2 pt-2">
              <label className="text-xs text-text-secondary font-medium block">
                Profile Picture (Optional)
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-white/15 hover:border-velocity-red bg-surface-container hover:bg-surface-container-high transition-all flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group shadow-inner"
                title="Upload Profile Picture"
              >
                {avatarUrl ? (
                  <>
                    <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[11px] text-white font-medium">Change</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center hover:bg-velocity-red transition-colors"
                      title="Remove picture"
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
                    <span className="text-[10px] text-text-secondary group-hover:text-text-primary transition-colors font-medium">
                      Add Photo
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Username Input Area */}
            <div className="space-y-2">
              <label className="text-xs text-text-secondary font-medium block" htmlFor="username">
                Username
              </label>
              <div className="relative flex items-center bg-surface-container rounded-md border border-white/10 transition-colors duration-200 focus-within:border-velocity-red focus-within:ring-1 focus-within:ring-velocity-red">
                <span className="pl-3.5 text-text-muted select-none text-sm">@</span>
                <input
                  autoComplete="off"
                  className="w-full bg-transparent border-none text-text-primary text-sm py-2.5 px-2 focus:ring-0 placeholder:text-text-muted outline-none"
                  id="username"
                  name="username"
                  placeholder="username"
                  spellCheck="false"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={15}
                />
                {username.length >= 3 && !error && (
                  <div className="pr-3">
                    <CheckCircle className="text-green-400 w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Helper Text */}
              <div className="flex justify-between items-center min-h-[18px]">
                {error ? (
                  <p className="text-xs text-velocity-red">{error}</p>
                ) : (
                  <p className="text-xs text-text-muted">3-15 characters, letters, numbers, and underscores.</p>
                )}
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                className="w-full bg-velocity-red text-white text-sm py-3 rounded-md font-semibold tracking-wide hover:bg-red-600 active:scale-[0.99] transition-all duration-200 flex justify-center items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,77,77,0.3)]"
                type="submit"
                disabled={!username.trim() || isSubmitting || username.length < 3}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Games</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-200" />
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
