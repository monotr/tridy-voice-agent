// ========================= RealtimeClient.ts =========================

export type RealtimeEvent =
  | { kind: "partial_text"; text: string }
  | { kind: "final_text"; text: string }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string }
  | { kind: "vad"; state: "started" | "stopped" | "committed" }
  | { kind: "action"; data: any }   // <- JSON final confirmado (para que llames a tu backend)
  | { kind: "raw"; data: any }
  | { kind: "user_text"; text: string }      // transcripción final del usuario
  | { kind: "pending_action"; data: any }    // acción detectada, esperando confirmación
;

const USE_VOICE = true;   // voz del asistente (audio de salida)
const DBG = true;

const log = (...a: any[]) => { if (DBG) console.log("[RT]", ...a); };
const err = (...a: any[]) => { if (DBG) console.error("[RT-ERR]", ...a); };

function decodeMsg(e: MessageEvent): string {
  try { return typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data); }
  catch { return ""; }
}
function safeParse(e: MessageEvent): any {
  const t = decodeMsg(e);
  try { return JSON.parse(t); } catch { return null; }
}

async function getMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia no soportado (requiere HTTPS).");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
  });
  log("Mic:", stream.getAudioTracks().map(t => t.label));
  return stream;
}

// Utilidad para armar prompt de confirmación
function buildConfirmPrompt(a: any): string {
  const { accion, params = {} } = a || {};
  const camposOpcionales = [
    "tipo", "precio_unitario", "costo_produccion", "tiempo_impresion",
    "stock_alerta", "gramos", "etiquetas", "notas", "cliente", "productos",
    "proveedor", "precio_total", "categoria", "fecha", "prioridad"
  ];
  const faltan = camposOpcionales.filter(k => !(k in params));
  const resumen = JSON.stringify({ accion, params });
  return (
    "Detecté la siguiente acción. " +
    "Confirma o cancela, y dime si quieres agregar algo:\n" +
    resumen + "\n" +
    (faltan.length ? `Puedes agregar: ${faltan.join(", ")}.` : "No veo campos opcionales pendientes.") +
    " Responde diciendo por ejemplo: 'confirma', 'cancela', o 'agrega tipo articulado y precio 120'."
  );
}

export async function startRealtimeSession(
  onEvent?: (evt: RealtimeEvent) => void
): Promise<RTCPeerConnection> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  log("Backend:", backendUrl);

  const pc = new RTCPeerConnection();
  pc.oniceconnectionstatechange = () => log("ICE:", pc.iceConnectionState);
  pc.onconnectionstatechange     = () => log("PC:",  pc.connectionState);
  pc.onsignalingstatechange      = () => log("SIG:", pc.signalingState);

  // audio remoto del asistente
  if (USE_VOICE) { try { pc.addTransceiver("audio", { direction: "recvonly" }); } catch {} }
  pc.ontrack = (ev) => {
    const el = document.getElementById("assistant-audio") as HTMLAudioElement | null;
    if (el) { el.srcObject = ev.streams[0]; el.play().catch(()=>{}); }
  };

  // canal de datos
  const dc = pc.createDataChannel("oai-events");
  __dc = dc;

  // estado conversación
  let activeResponseId: string | null = null;
  let lastCommitAt = 0;
  let pendingAction: any = null;     // <- acción por confirmar

  // ———————— handler de mensajes ————————
  const handleMsg = (e: MessageEvent) => {
    const raw = decodeMsg(e);
    if (raw) onEvent?.({ kind: "raw", data: raw });

    const p = safeParse(e);
    if (!p) return;

    // debug útil
    if (p.type === "conversation.item.created") log("item.created:", p.item?.content);

    // VAD
    if (p.type === "input_audio_buffer.speech_started") {
      onEvent?.({ kind: "vad", state: "started" }); return;
    }
    if (p.type === "input_audio_buffer.speech_stopped") {
      onEvent?.({ kind: "vad", state: "stopped" }); return;
    }
    if (p.type === "input_audio_buffer.committed") {
      onEvent?.({ kind: "vad", state: "committed" });
      const now = Date.now();
      if (now - lastCommitAt < 350) return; // throttle
      lastCommitAt = now;
      if (activeResponseId) return;

      // dispara
      dc.send(JSON.stringify({ type: "response.create", response: {} }));
      // watchdog simple
      setTimeout(() => { if (!activeResponseId) dc.send(JSON.stringify({ type: "response.create", response: {} })); }, 1200);
      return;
    }

    // response lifecycle
    if (p.type === "response.created" && p.response?.id) {
      activeResponseId = p.response.id; return;
    }
    if (p.type === "response.output_text.delta" && p.delta) {
      onEvent?.({ kind: "partial_text", text: p.delta }); return;
    }
    if (p.type === "response.output_text.done" && p.text) {
      activeResponseId = null;
      onEvent?.({ kind: "final_text", text: p.text }); return;
    }
    if (p.type === "response.completed" && p.response?.output?.text) {
      activeResponseId = null;
      onEvent?.({ kind: "final_text", text: p.response.output.text }); return;
    }

    // ——— TOOLS ———

    // 1) emit_action (bloque compacto)
    if (p.type === "response.output_tool_calls.done" && Array.isArray(p.tool_calls)) {
      for (const tc of p.tool_calls) {
        const name = tc.name || tc.function?.name;
        if (name === "emit_action") {
          const argsStr = tc.arguments ?? tc.function?.arguments ?? "{}";
          let parsed: any = {};
          try { parsed = JSON.parse(argsStr); } catch {}
          pendingAction = parsed;

          // avisa a la UI que hay algo por confirmar
          onEvent?.({ kind: "pending_action", data: pendingAction });

          // responde tool_output para cerrar el paso…
          dc.send(JSON.stringify({
            type: "response.tool_output",
            tool_call_id: tc.id,
            output: JSON.stringify({ status: "received" })
          }));

          // …y crea una respuesta pidiendo confirmación
          const confirmText = buildConfirmPrompt(pendingAction);
          dc.send(JSON.stringify({
            type: "response.create",
            response: { instructions: confirmText }
          }));
        }
        if (name === "confirm_action") {
          const argsStr = tc.arguments ?? tc.function?.arguments ?? "{}";
          let conf: any = {};
          try { conf = JSON.parse(argsStr); } catch {}
          // merge updates
          if (pendingAction && conf?.updates && typeof conf.updates === "object") {
            pendingAction = { ...pendingAction, params: { ...(pendingAction.params||{}), ...conf.updates } };
          }
          const confirmed = !!conf?.confirm;

          dc.send(JSON.stringify({
            type: "response.tool_output",
            tool_call_id: tc.id /* o p.call_id */,
            output: JSON.stringify({ ok: confirmed })
          }));

          if (confirmed && pendingAction) {
            // ← AQUÍ recien notificas a tu app
            onEvent?.({ kind: "action", data: pendingAction });

            const doneText = `Listo, ejecutaré ${pendingAction.accion} con: ${JSON.stringify(pendingAction.params)}.`;
            dc.send(JSON.stringify({ type: "response.create", response: { instructions: doneText } }));
            pendingAction = null;
          } else {
            const cancelText = "Acción cancelada. ¿Deseas intentar otra instrucción?";
            dc.send(JSON.stringify({ type: "response.create", response: { instructions: cancelText } }));
            pendingAction = null;
          }
        }
      }
      return;
    }

    // 2) emit_action / confirm_action (variante incremental)
    if (p.type === "response.function_call_arguments.done") {
      const name = p.name;
      const args = p.arguments ?? "{}";
      if (name === "emit_action") {
        let parsed: any = {};
        try { parsed = JSON.parse(args); } catch {}
        pendingAction = parsed;
        dc.send(JSON.stringify({
          type: "response.tool_output",
          tool_call_id: p.call_id || p.id,
          output: JSON.stringify({ status: "received" })
        }));
        const confirmText = buildConfirmPrompt(pendingAction);
        dc.send(JSON.stringify({ type: "response.create", response: { instructions: confirmText } }));
        return;
      }
      if (name === "confirm_action") {
        let conf: any = {};
        try { conf = JSON.parse(args); } catch {}
        if (pendingAction && conf?.updates && typeof conf.updates === "object") {
          pendingAction = { ...pendingAction, params: { ...(pendingAction.params||{}), ...conf.updates } };
        }
        const confirmed = !!conf?.confirm;
        dc.send(JSON.stringify({
          type: "response.tool_output",
          tool_call_id: p.call_id || p.id,
          output: JSON.stringify({ ok: confirmed })
        }));
        if (confirmed && pendingAction) {
          onEvent?.({ kind: "action", data: pendingAction });
          const doneText = `Listo, ejecutaré ${pendingAction.accion} con: ${JSON.stringify(pendingAction.params)}.`;
          dc.send(JSON.stringify({ type: "response.create", response: { instructions: doneText } }));
          pendingAction = null;
        } else {
          const cancelText = "Acción cancelada. ¿Deseas intentar otra instrucción?";
          dc.send(JSON.stringify({ type: "response.create", response: { instructions: cancelText } }));
          pendingAction = null;
        }
        return;
      }
    }

    // errores
    if (p.type === "response.error") {
      activeResponseId = null;
      const msg = p.error?.message || "response.error";
      err(msg); onEvent?.({ kind: "error", message: msg }); return;
    }
    if (p.type === "response.done") {
      if (p.response?.status === "failed" || p.status === "failed") {
        activeResponseId = null;
        const m = p.response?.status_details?.message || p.status_details?.message || "Respuesta falló";
        err(m); onEvent?.({ kind: "error", message: m });
      } else {
        activeResponseId = null;
      }
      return;
    }

    // alternativa transcript.*
    if (p.type === "transcript.delta" && p.text) {
      onEvent?.({ kind: "partial_text", text: p.text }); return;
    }
    if (p.type === "transcript.done" && p.text) {
      onEvent?.({ kind: "user_text", text: p.text });
      return;
    }

  };

  dc.onmessage = handleMsg;
  pc.ondatachannel = (ev) => { ev.channel.onmessage = handleMsg; };

  // ———————— apertura del canal: configuramos sesión ————————
  dc.onopen = () => {
    onEvent?.({ kind: "info", message: "Canal de datos abierto" });

    // Tool: extracción de acción
    const emitActionTool = {
      type: "function",
      name: "emit_action",
      description:
        "Analiza el texto (transcrito del audio) y emite una acción JSON {accion, params}.",
      parameters: {
        type: "object",
        required: ["accion", "params"],
        properties: {
          accion: {
            type: "string",
            enum: [
              "crear_producto",
              "modificar_producto",
              "registrar_movimiento_inventario",
              "registrar_compra",
              "registrar_gasto",
              "crear_cotizacion",
              "registrar_evento",
              "crear_tarea",
              "resumen_inventario",
              "ver_producto",
              "otro"
            ]
          },
          params: {
            type: "object",
            additionalProperties: true,
            properties: {
              producto: { type: "string" }, tipo: { type: "string" },
              descripcion: { type: "string" },
              etiquetas: { type: "array", items: { type: "string" } },
              precio_unitario: { type: "number" },
              costo_produccion: { type: "number" },
              tiempo_impresion: { type: "integer" },
              stock_alerta: { type: "integer" }, gramos: { type: "integer" },
              cantidad: { type: "integer" }, notas: { type: "string" },
              precio_total: { type: "number" }, proveedor: { type: "string" },
              descripcion_gasto: { type: "string" }, monto: { type: "number" },
              categoria: { type: "string" },
              cliente: { type: "string" },
              productos: {
                type: "array",
                items: { type: "object",
                  properties: { producto: { type: "string" }, cantidad: { type: "integer" } },
                  required: ["producto","cantidad"] }
              },
              nombre: { type: "string" }, fecha: { type: "string" },
              prioridad: { type: "string", enum: ["baja","media","alta"] },
              texto_original: { type: "string" }
            }
          }
        }
      }
    };

    // Tool: confirmación / cancelación + updates
    const confirmTool = {
      type: "function",
      name: "confirm_action",
      description:
        "Confirma ('confirm': true) o cancela ('confirm': false) la acción detectada. " +
        "Opcionalmente incluye 'updates' para ajustar campos antes de ejecutar.",
      parameters: {
        type: "object",
        required: ["confirm"],
        properties: {
          confirm: { type: "boolean" },
          updates: { type: "object", additionalProperties: true }
        }
      }
    };

    // Instrucciones: SIEMPRE extrae acción, luego solicita confirmación y espera confirm_action
    const systemRules =
      "1) Extrae la intención y llama al tool 'emit_action'. " +
      "2) Presenta un RESUMEN breve y PIDE CONFIRMACIÓN explícita: confirmar o cancelar; " +
      "   sugiere campos opcionales (tipo, precio_unitario, costo_produccion, tiempo_impresion, " +
      "   stock_alerta, gramos, etiquetas, notas, cliente, productos, proveedor, precio_total, " +
      "   categoria, fecha, prioridad). " +
      "3) NO anuncies creación/ejecución ni confirmes la acción hasta recibir 'confirm_action' con confirm=true. " +
      "4) Si el usuario agrega campos, pasa por 'confirm_action' con 'updates'. " +
      "Responde en español de MX.";


    const sessionUpdate = {
      type: "session.update" as const,
      session: {
        instructions: systemRules,
        modalities: USE_VOICE ? ["audio", "text"] : ["text"],
        ...(USE_VOICE ? { voice: "alloy" } : {}),
        input_audio_transcription: { model: "whisper-1", language: "es" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
          create_response: false,
          interrupt_response: true
        },
        tools: [emitActionTool, confirmTool],
        tool_choice: "auto"
      }
    };

    log("session.update:", sessionUpdate);
    dc.send(JSON.stringify(sessionUpdate));
  };

  // ———————— mic ————————
  const stream = await getMicStream();
  stream.getTracks().forEach(t => pc.addTrack(t, stream));

  // ———————— SDP ————————
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const tokenRes = await fetch(`${backendUrl}/realtime/token`, { method: "POST" });
  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    err("Token error:", tokenRes.status, txt);
    onEvent?.({ kind: "error", message: `Token error ${tokenRes.status}: ${txt}` });
    throw new Error(txt);
  }
  const { endpoint, ephemeral_token, model } = await tokenRes.json();
  const sdpUrl = `${endpoint}?model=${encodeURIComponent(model || "gpt-4o-mini-realtime-preview")}`;
  log("SDP →", sdpUrl);

  const resp = await fetch(sdpUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${ephemeral_token}`, "Content-Type": "application/sdp" },
    body: offer.sdp || ""
  });
  if (!resp.ok) {
    const txt = await resp.text();
    err("SDP error:", resp.status, txt);
    onEvent?.({ kind: "error", message: `SDP error ${resp.status}: ${txt}` });
    throw new Error(txt);
  }
  const answer = await resp.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
  onEvent?.({ kind: "info", message: "Sesión Realtime conectada" });
  log("SDP answer aplicada.");

  return pc;
}

let __dc: RTCDataChannel | null = null;

export function sendUserText(text: string) {
  if (!__dc || __dc.readyState !== "open") return;
  __dc.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message", role: "user",
      content: [{ type: "input_text", text }]
    }
  }));
  __dc.send(JSON.stringify({ type: "response.create", response: {} }));
}


// ====================================================================
