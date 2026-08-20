import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';
import { Send, MessageSquare } from 'lucide-react';

export default function Chat({ gameId }: { gameId: string }) {
  const { user, spectatingGameId } = useGameStore();
  const isSpectator = !!spectatingGameId;
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, `games/${gameId}/messages`),
      orderBy('createdAt', 'asc'),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `games/${gameId}/messages`)
    );

    return () => unsub();
  }, [gameId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user || isSpectator) return;

    try {
      await addDoc(collection(db, `games/${gameId}/messages`), {
        senderId: user.id,
        senderName: user.username,
        text: text.trim(),
        createdAt: serverTimestamp(),
      });
      setText('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Header */}
      <div className="p-4 border-b border-glass-border flex justify-between items-center bg-surface-elevated/40">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-velocity-red" />
          <h3 className="font-label-caps text-xs text-text-primary font-bold uppercase tracking-wider">
            Terminal Uplink
          </h3>
        </div>
        <span className="font-label-caps text-[10px] text-text-muted font-mono">
          {messages.length} MSGS
        </span>
      </div>

      {/* Message Stream */}
      <div className="flex-1 p-4 space-y-2.5 overflow-y-auto min-h-0 divide-y divide-transparent">
        {messages.length === 0 ? (
          <div className="text-center text-text-muted font-label-caps text-[11px] py-8">
            Encrypted Channel Established.
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            const time = msg.createdAt?.toDate
              ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '...';
            const name = isMe ? 'You' : msg.senderName || msg.senderId.substring(0, 6);

            return (
              <div key={msg.id} className="flex flex-col gap-0.5 text-xs font-body-sm pt-1">
                <div className="flex items-center gap-2">
                  <span className={`font-label-caps text-[10px] font-bold ${isMe ? 'text-velocity-red' : 'text-text-primary'}`}>
                    {name}
                  </span>
                  <span className="font-mono text-[9px] text-text-muted">
                    {time}
                  </span>
                </div>
                <p className="text-text-secondary text-xs break-words bg-surface-container/40 p-2 rounded border border-glass-border">
                  {msg.text}
                </p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-surface-elevated border-t border-glass-border mt-auto">
        {isSpectator ? (
          <div className="font-label-caps text-[10px] uppercase tracking-wider text-text-muted text-center py-1">
            Spectator Feed — Read Only
          </div>
        ) : (
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Transmit message..."
              className="flex-1 bg-surface-base border border-glass-border text-text-primary font-body-sm text-xs px-3 py-2 rounded focus:border-velocity-red outline-none placeholder:text-text-muted"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="bg-velocity-red text-text-primary px-3 py-2 rounded hover:bg-primary-container disabled:opacity-40 transition-colors"
            >
              <Send size={14} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
