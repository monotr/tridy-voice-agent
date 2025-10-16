'use client';
import ChatFrame from "../components/ChatFrame";

export default function Page(){
  return (
    <main style={{padding: 24, maxWidth: 900, margin: '0 auto'}}>
      <h1 style={{fontSize: 26, fontWeight: 700}}>Tridyland Voice Agent</h1>
      <p>Presiona “Hablar”, dicta una instrucción y luego confirma si aparece una acción.</p>
      <ChatFrame />
    </main>
  );
}

