'use client';
import { useRef, useState } from "react";
import { startRealtimeSession, sendUserText, RealtimeEvent } from "./realtime/RealtimeClient";

type Msg = { role: 'assistant'|'user'|'system', text: string };

export default function ChatFrame(){
  const [messages, setMessages] = useState<Msg[]>([]);
  const [partial, setPartial] = useState<string>("");
  const pcRef = useRef<RTCPeerConnection|null>(null);
  const [on, setOn] = useState(false);

  const [pending, setPending] = useState<any|null>(null);   // acción por confirmar
  const [lastUser, setLastUser] = useState<string>("");     // último texto del usuario

  const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'ready'>('idle');


  function onEvent(e: RealtimeEvent){
    if (e.kind === "raw") {
      // Para confirmar que realmente llegan los tool_calls
      try { console.log("[RAW]", typeof e.data === "string" ? e.data : e.data); } catch {}
    }
    if (e.kind === "vad") {
      if (e.state === "started")   setStatus('listening');
      if (e.state === "stopped")   setStatus('processing');
      if (e.state === "committed") setStatus('processing');
      return;
    }
    if (e.kind === "user_text") {
      setLastUser(e.text);
      setMessages([{ role: 'user', text: e.text }]); // mostramos sólo el último comando
      return;
    }
    
    if (e.kind === "pending_action") {
      console.log("🔄 Nueva acción pendiente:", e.data);
      // fuerza render: clona profundo para nueva referencia
      const next = typeof structuredClone === "function"
        ? structuredClone(e.data)
        : JSON.parse(JSON.stringify(e.data));

      // evita bug de no render si es igual
      setPending((prev) => {
        if (JSON.stringify(prev) !== JSON.stringify(next)) return next;
        return prev;
      });
      return;
    }


    if(e.kind === "partial_text"){
      setPartial((p) => p + e.text); // acumula
    }

    if (e.kind === "final_text") {
      if (partial) setPartial("");
      setMessages((m) => [...m, { role: 'assistant', text: e.text }]);
      return;
    }


    if (e.kind === "info") {
      if (e.message?.includes("Sesión Realtime conectada")) setStatus('ready');
      return; // opcional: quita el setMessages si ya no quieres logs en el chat
    }

    if (e.kind === "error"){
      setMessages((m)=>[...m, {role:'system', text:`❌ ${e.message}`}]);
    }
    
    if (e.kind === "action") {
      setPending(null);               // ahora sí, ya se confirmó y ejecutó
      setMessages((m)=>[...m, {role:'system', text:'✅ Acción confirmada y enviada al backend'}]);
      return;
    }


    if (e.kind === "error") {
      setStatus('ready');
      setMessages((m)=>[...m, {role:'system', text:`❌ ${e.message}`}]);
      return;
    }


  }

  async function toggle(){
    if(!on){
      setPartial("");
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
    }catch(err:any){
      setMessages((m)=>[...m, {role:'system', text:`❌ error en ${name}: ${String(err)}`}]);
    }
  }

  function camposOpcionalesFaltantes(p: any) {
    const base = [
      "tipo","precio_unitario","costo_produccion","tiempo_impresion",
      "stock_alerta","gramos","etiquetas","notas","cliente","productos",
      "proveedor","precio_total","categoria","fecha","prioridad"
    ];
    const params = p?.params || {};
    return base.filter(k => !(k in params));
  }


  return (
    <div className="mx-auto max-w-3xl p-4 grid gap-3">
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className={`px-4 py-2 rounded-2xl text-white ${on? 'bg-red-500':'bg-green-600'}`}
        >{on? 'Detener' : 'Hablar'}</button>
        
        <span className="text-xl select-none">
          {status === 'idle'       && '⭕'}   {/* inactivo */}
          {status === 'listening'  && '🎙️'}  {/* escuchando */}
          {status === 'processing' && '⏳'}   {/* procesando */}
          {status === 'ready'      && '✅'}   {/* listo */}
        </span>

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

      {pending && (
        <div className="rounded-xl border p-3 bg-yellow-50">
          <div className="font-semibold mb-1">Confirma acción</div>

          <div className="text-sm mb-2">
            <div><b>Acción:</b> {pending.accion}</div>
          </div>

          <div className="text-xs mb-1 font-semibold">Parámetros actuales</div>
          <div className="text-xs bg-white rounded p-2 overflow-auto">
            <ul className="list-disc pl-5">
              {Object.entries(pending.params ?? {}).map(([k,v])=>(
                <li key={k}><b>{k}</b>: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
              ))}
              {Object.keys(pending.params ?? {}).length === 0 && <li>(sin parámetros)</li>}
            </ul>
          </div>

          <div className="text-xs mt-2">
            Puedes agregar (opcional):{" "}
            {(() => {
              const base = ["tipo","precio_unitario","costo_produccion","tiempo_impresion","stock_alerta","gramos","etiquetas","notas","cliente","productos","proveedor","precio_total","categoria","fecha","prioridad"];
              const params = pending?.params || {};
              const faltan = base.filter(k => !(k in params));
              return faltan.length ? faltan.join(", ") : "—";
            })()}
          </div>

          <div className="mt-2 flex gap-2">
            <button
              className="px-3 py-1 rounded bg-green-600 text-white"
              onClick={() => sendUserText("confirmo")}  // <- deja que el backend haga la confirmación real
            >
              Confirmar
            </button>
            <button
              className="px-3 py-1 rounded bg-gray-300"
              onClick={() => { sendUserText("cancela"); /* opcional: setPending(null); */ }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}



    </div>
  )
}
