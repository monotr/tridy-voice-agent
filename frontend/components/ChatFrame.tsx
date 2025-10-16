'use client';
import { useRef, useState } from "react";
import { startRealtimeSession, RealtimeEvent } from "./realtime/RealtimeClient";

type Msg = { role: 'assistant'|'user'|'system', text: string };

export default function ChatFrame(){
  const [messages, setMessages] = useState<Msg[]>([]);
  const [partial, setPartial] = useState<string>("");
  const [toolCall, setToolCall] = useState<{name:string; args:any} | null>(null);
  const pcRef = useRef<RTCPeerConnection|null>(null);
  const [on, setOn] = useState(false);

  function onEvent(e: RealtimeEvent){
    if (e.kind === "vad") {
        if (e.state === "started")  setMessages(m => [...m, {role:'system', text:'🎙️ Escuchando...'}]);
        if (e.state === "stopped")  setMessages(m => [...m, {role:'system', text:'✋ Detecté silencio, procesando...'}]);
        if (e.state === "committed")setMessages(m => [...m, {role:'system', text:'📦 Audio listo para transcribir'}]);
    }

    if(e.kind === "partial_text"){
      setPartial((p) => p + e.text); // acumula
    } else if (e.kind === "final_text"){
      if (partial) setPartial(""); // limpia el parcial
      setMessages((m) => [...m, { role: 'assistant', text: e.text }]);
    } else if (e.kind === "tool_call"){
      setToolCall({ name: e.name, args: e.args });
    } else if (e.kind === "info"){
      setMessages((m)=>[...m, {role:'system', text:e.message}]);
    } else if (e.kind === "error"){
      setMessages((m)=>[...m, {role:'system', text:`❌ ${e.message}`}]);
    }
  }

  async function toggle(){
    if(!on){
      setPartial("");
      setToolCall(null);
      pcRef.current = await startRealtimeSession(onEvent);
      setOn(true);
    } else {
      pcRef.current?.getSenders().forEach(s => s.track?.stop());
      pcRef.current?.close();
      pcRef.current = null;
      setOn(false);
    }
  }

  async function confirmarToolCall(){
    if(!toolCall) return;
    const base = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    const name = toolCall.name;
    try{
      const r = await fetch(`${base}/actions/${name.replace('_','-')}`, {
        method: name.startsWith("consultar") ? "GET" : "POST",
        headers: { "Content-Type":"application/json" },
        body: name.startsWith("consultar") ? undefined : JSON.stringify(toolCall.args)
      });
      const data = await r.json();
      setMessages((m)=>[...m, {role:'system', text:`✅ ${name}: ${JSON.stringify(data)}`}]);
      setToolCall(null);
    }catch(err:any){
      setMessages((m)=>[...m, {role:'system', text:`❌ error en ${name}: ${String(err)}`}]);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 grid gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className={`px-4 py-2 rounded-2xl text-white ${on? 'bg-red-500':'bg-green-600'}`}
        >{on? 'Detener' : 'Hablar'}</button>
        <audio id="assistant-audio" autoPlay playsInline />
      </div>

      <div className="rounded-xl border p-3 h-[56vh] overflow-auto bg-white">
        {messages.map((m, i)=>(
          <div key={i} className="my-1">
            <div className={`text-sm ${m.role==='assistant'?'text-blue-700': m.role==='system'?'text-gray-500':'text-black'}`}>
              {m.text}
            </div>
          </div>
        ))}
        {!!partial && (
          <div className="my-1 text-blue-400">
            {partial}<span className="opacity-40">▌</span>
          </div>
        )}
      </div>

      {toolCall && (
        <div className="rounded-xl border p-3 bg-yellow-50">
          <div className="font-semibold mb-1">Acción detectada</div>
          <div className="text-sm">tool: <b>{toolCall.name}</b></div>
          <pre className="text-xs bg-white rounded p-2 mt-2 overflow-auto">
{JSON.stringify(toolCall.args, null, 2)}
          </pre>
          <div className="mt-2 flex gap-2">
            <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={confirmarToolCall}>
              Confirmar
            </button>
            <button className="px-3 py-1 rounded bg-gray-300" onClick={()=>setToolCall(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
