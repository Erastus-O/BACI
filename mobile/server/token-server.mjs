// Minimal token server for a *private* ElevenLabs agent (authentication enabled).
// Keeps ELEVENLABS_API_KEY off the device: the app asks this server for a
// short-lived conversation token (voice, WebRTC) or signed URL (text, WebSocket).
//
//   ELEVENLABS_API_KEY=sk_... ELEVENLABS_AGENT_ID=agent_... npm run token-server
//   then set EXPO_PUBLIC_BACI_TOKEN_URL=http://<your-computer-LAN-IP>:8787 in mobile/.env
//
// Prototype only: add your own user authentication before exposing this publicly.
import { createServer } from 'node:http';

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID ?? process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID;
const port = Number(process.env.PORT ?? 8787);
const api = 'https://api.elevenlabs.io/v1/convai/conversation';

if (!apiKey || !agentId) {
  console.error('Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID.');
  process.exit(1);
}

async function elevenlabs(path) {
  const res = await fetch(`${api}/${path}?agent_id=${encodeURIComponent(agentId)}`, { headers: { 'xi-api-key': apiKey } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return res.json();
}

const routes = {
  '/conversation-token': async () => ({ token: (await elevenlabs('token')).token }),
  '/signed-url': async () => ({ signedUrl: (await elevenlabs('get-signed-url')).signed_url }),
};

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const handler = routes[new URL(req.url ?? '/', 'http://x').pathname];
  if (req.method !== 'GET' || !handler) {
    res.writeHead(404).end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  try {
    res.writeHead(200).end(JSON.stringify(await handler()));
  } catch (e) {
    console.error(e);
    res.writeHead(502).end(JSON.stringify({ error: String(e.message ?? e) }));
  }
}).listen(port, () => console.log(`BACI token server on http://localhost:${port}`));
