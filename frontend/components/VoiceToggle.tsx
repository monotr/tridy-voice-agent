
'use client';
import { useRef, useState } from 'react';
import { startRealtimeSession } from './realtime/RealtimeClient';

export default function VoiceToggle(){
  const [on, setOn] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  return (
    <div style={{marginTop: 16}}>
      <button
        onClick={async ()=>{
          if(!on){
            pcRef.current = await startRealtimeSession();
            setOn(true);
          }else{
            pcRef.current?.getSenders().forEach(s => s.track?.stop());
            pcRef.current?.close();
            setOn(false);
          }
        }}
        style={{padding: '10px 16px', borderRadius: 12, background: on? '#e11d48':'#22c55e', color: 'white'}}
      >
        {on? 'Detener' : 'Hablar'}
      </button>
    </div>
  );
}
