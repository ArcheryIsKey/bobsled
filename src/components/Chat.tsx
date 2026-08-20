import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';
import { Send, MessageSquare } from 'lucide-react';

export default function Chat({ gameId }: { gameId: string }) {
  const { user } = useGameStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

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
        // Scroll only the internal chat container, NEVER the page/window
        setTimeout(() => {
          if (chatScrollContainerRef.current) {
            chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
          }
        }, 50);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `games/${gameId}/messages`)
    );

    return () => unsub();
  }, [gameId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const messageToSend = text.trim();
    if (!messageToSend || !user) return;

    setText('');

    addDoc(collection(db, `games/${gameId}/messages`), {
      senderId: user.id,
      senderName: user.username,
      isTestUser: !!user.isTestUser,
      text: messageToSend,
      createdAt: serverTimestamp(),
    }).catch((err) => {
      console.error('Failed to send message:', err);
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#141414]">
      {/* Header */}
      <div className="p-3.5 border-b border-white/10 flex justify-between items-center bg-[#181818]">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-velocity-red" />
          <h3 className="text-xs text-white font-bold uppercase tracking-wider font-mono">
            Game Chat
          </h3>
        </div>
      </div>

      {/* Message Stream with container-only scroll to prevent page jumping */}
      <div
        ref={chatScrollContainerRef}
        className="flex-1 p-3.5 space-y-2.5 overflow-y-auto min-h-0 overscroll-contain"
      >
        {messages.length === 0 ? (
          <div className="text-center text-text-muted text-xs py-6 font-mono">
            No messages yet. Say hello!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            const time = msg.createdAt?.toDate
              ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '...';
            
            const isMsgSenderTest = msg.isTestUser || msg.senderId?.startsWith?.('test_');
            const rawName = isMe ? (user?.username || 'You') : (msg.senderName || msg.senderId.substring(0, 6));
            const name = isMsgSenderTest ? rawName : `@${rawName}`;

            return (
              <div key={msg.id} className="flex flex-col gap-0.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] font-semibold ${isMe ? 'text-velocity-red' : 'text-white'}`}>
                    {name}
                  </span>
                  <span className="text-[9px] text-text-muted font-mono">
                    {time}
                  </span>
                </div>
                <p className="text-text-secondary text-xs break-words bg-[#1a1a1a] p-2 rounded-lg border border-white/5 font-body-sm">
                  {msg.text}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="p-2.5 bg-[#181818] border-t border-white/10 mt-auto">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-[#101010] border border-white/10 text-white text-xs px-3.5 py-2 rounded-full focus:border-velocity-red outline-none placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="w-8 h-8 rounded-full bg-velocity-red hover:bg-red-600 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Send size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
