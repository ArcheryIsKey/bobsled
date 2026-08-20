import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';

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
    
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `games/${gameId}/messages`));

    return () => unsub();
  }, [gameId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;
    
    try {
      await addDoc(collection(db, `games/${gameId}/messages`), {
        senderId: user.id,
        text: text.trim(),
        createdAt: serverTimestamp()
      });
      setText('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0D0D0D]">
      <div className="p-6 flex-1 flex flex-col min-h-0">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-6 shrink-0">Terminal Chat</h2>
        
        <div className="flex-1 space-y-4 overflow-y-auto mb-4 pr-2">
          {messages.map(msg => {
            const isMe = msg.senderId === user?.id;
            const time = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...';
            return (
              <div key={msg.id} className="flex flex-col gap-1">
                <span className="text-[10px] text-neutral-600 font-mono">[{time}] {isMe ? 'You' : msg.senderId.substring(0,6)}:</span>
                <p className="text-xs text-neutral-300 break-words">{msg.text}</p>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="mt-auto pt-4 border-t border-neutral-800 shrink-0">
          {isSpectator ? (
             <div className="text-[10px] uppercase tracking-widest text-neutral-600 font-mono text-center">
               Spectator Chat Disabled
             </div>
          ) : (
            <form onSubmit={handleSend} className="w-full">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type message..."
                className="w-full bg-transparent border-none text-xs focus:ring-0 text-neutral-400 p-0 outline-none placeholder:text-neutral-700"
              />
            </form>
          )}
        </div>
      </div>
      
      <div className="p-6 bg-neutral-900/30 border-t border-neutral-800 shrink-0">
        <h2 className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-4">Wager Status</h2>
        <div className="space-y-2">
           <div className="flex justify-between text-[10px] font-mono">
             <span className="text-neutral-500">STAKE</span>
             <span className="text-[#14F195]">ACTIVE</span>
           </div>
        </div>
      </div>
    </div>
  );
}
