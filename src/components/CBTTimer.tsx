import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface CBTTimerProps {
  durationSeconds: number;
  startedAt: number; // epoch ms when the session started
  onExpire: () => void;
}

export default function CBTTimer({ durationSeconds, startedAt, onExpire }: CBTTimerProps) {
  const calcRemaining = () => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    return Math.max(0, durationSeconds - elapsed);
  };

  const [remaining, setRemaining] = useState(calcRemaining);
  const calledExpire = useRef(false);

  useEffect(() => {
    if (remaining === 0 && !calledExpire.current) {
      calledExpire.current = true;
      onExpire();
      return;
    }
    const id = setInterval(() => {
      const r = calcRemaining();
      setRemaining(r);
      if (r === 0 && !calledExpire.current) {
        calledExpire.current = true;
        clearInterval(id);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const isWarning = remaining <= 300 && remaining > 0; // < 5 min
  const isCritical = remaining <= 60 && remaining > 0; // < 1 min

  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-mono font-bold text-lg transition-all
      ${isCritical ? 'bg-rose-600 text-white animate-pulse' : isWarning ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-800'}
    `}>
      <Clock className={`w-5 h-5 flex-shrink-0 ${isCritical ? 'text-white' : isWarning ? 'text-rose-500' : 'text-slate-500'}`} />
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </div>
  );
}
