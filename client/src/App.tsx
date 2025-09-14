import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';

const SIGNAL_URL = 'ws://localhost:3001';

type SignalMessage =
  | { type: 'welcome'; id: string }
  | { type: 'joined'; id: string; room: string }
  | { type: 'peers'; peers: string[] }
  | { type: 'peer-joined'; id: string }
  | { type: 'peer-left'; id: string }
  | { type: 'signal'; from: string; data: any };

export default function App() {
  const [room, setRoom] = useState('demo');
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  function addLog(s: string) {
    setLog((prev) => [s, ...prev].slice(0, 100));
  }

  function connectWS() {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(SIGNAL_URL);
    wsRef.current = ws;

    ws.onopen = () => addLog('WS connected');
    ws.onclose = () => addLog('WS closed');
    ws.onerror = (e) => addLog('WS error');

    ws.onmessage = async (ev) => {
      const msg: SignalMessage = JSON.parse(ev.data);
      if (msg.type === 'welcome') {
        setMyId(msg.id);
      }
      if (msg.type === 'joined') {
        addLog(`Joined room ${msg.room} as ${msg.id}`);
        setConnected(true);
        ws.send(JSON.stringify({ type: 'list' }));
      }
      if (msg.type === 'peers') {
        setPeers(msg.peers);
        if (msg.peers.length > 0) {
          // act as caller
          createOffer(msg.peers[0]);
        }
      }
      if (msg.type === 'peer-joined') {
        addLog(`Peer joined: ${msg.id}`);
        setPeers((p) => Array.from(new Set([...p, msg.id])));
      }
      if (msg.type === 'peer-left') {
        addLog(`Peer left: ${msg.id}`);
        setPeers((p) => p.filter((id) => id !== msg.id));
      }
      if (msg.type === 'signal') {
        await handleSignal(msg.from, msg.data);
      }
    };
  }

  async function setupMediaAndPC() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    // STUN only (TURN strongly recommended for real use)
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
    });
    pcRef.current = pc;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'signal', data: { ice: e.candidate } }));
      }
    };

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      addLog(`PC state: ${pc.connectionState}`);
    };

    // Optional data channel for chat/diagnostics
    dcRef.current = pc.createDataChannel('chat');
    dcRef.current.onopen = () => addLog('DataChannel open');
    dcRef.current.onmessage = (e) => addLog(`Peer: ${e.data}`);
  }

  async function createOffer(toId: string) {
    const pc = pcRef.current!;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsRef.current?.send(JSON.stringify({ type: 'signal', to: toId, data: { sdp: pc.localDescription } }));
    addLog('Offer sent');
  }

  async function handleSignal(fromId: string, data: any) {
    const pc = pcRef.current!;
    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        wsRef.current?.send(JSON.stringify({ type: 'signal', to: fromId, data: { sdp: pc.localDescription } }));
        addLog('Answer sent');
      } else if (data.sdp.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        addLog('Answer received');
      }
    } else if (data.ice) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.ice));
      } catch (e) {
        addLog('ICE add failed');
      }
    }
  }

  async function joinRoom() {
    connectWS();
    await setupMediaAndPC();
    wsRef.current?.send(JSON.stringify({ type: 'join', room }));
  }

  function sendChat() {
    const msg = `hello ${nanoid(4)}`;
    dcRef.current?.send(msg);
    addLog(`You: ${msg}`);
  }

  return (
    <div style={{ fontFamily: 'ui-sans-serif', padding: 16, display: 'grid', gap: 12 }}>
      <h1>WebRTC Proto</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="room id" />
        <button onClick={joinRoom} disabled={connected}>Join</button>
        <button onClick={sendChat} disabled={!connected}>Send test chat</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <h3>Local</h3>
          <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8 }}/>
        </div>
        <div>
          <h3>Remote</h3>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 8 }}/>
        </div>
      </div>

      <div>
        <h3>Status</h3>
        <div>My ID: {myId ?? '...'}</div>
        <div>Peers in room: {peers.join(', ') || 'none yet'}</div>
      </div>

      <div>
        <h3>Log</h3>
        <pre style={{ background: '#111', color: '#0f0', padding: 8, borderRadius: 8, maxHeight: 240, overflow: 'auto' }}>
{log.join('\n')}
        </pre>
      </div>
    </div>
  );
}
