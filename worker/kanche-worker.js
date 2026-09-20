// REFERENCE SERVER -- not wired into this repo's deploy, and deliberately so: nothing about a
// marbles game belongs on a tax site's domain or its database. Copy this directory into its own
// Cloudflare Worker project when you want online play.
//
// It serves both online tiers from one object:
//
//   Tier 1, async by room code (no paid plan needed if you swap the DO for KV/D1):
//     POST /room                      -> { room, token, seat }
//     POST /room/:code/join           -> { room, token, seat }
//     GET  /room/:code?since=N        -> { seat, shots, players, mode, seed, closed }
//     POST /room/:code/shot           -> { n }          body: { token, n, angle, power, foul, fromLine }
//
//   Tier 2, realtime:
//     GET  /room/:code/ws             -> WebSocket; same messages, pushed instead of polled
//
// The wire format is the point. A turn is the SHOT, never the board -- because the client
// physics is deterministic, every player replays the same inputs and lands on the same
// positions. A whole match is a list of ~30-byte records, which is also a free replay and a
// free "ghost" opponent.
//
// Anti-cheat: the server stores inputs only, so the worst a tampered client can do is send a
// shot it could have taken anyway. If you ever put a ladder on this, re-run the shot list
// server-side with the same physics module (Workers is V8, same as the browser) and compare.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I/O/0/1: these get read aloud
const MAX_PLAYERS = 4;
const IDLE_MS = 1000 * 60 * 60 * 24 * 3;

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'room') return json({ error: 'not found' }, 404);

    if (parts.length === 1 && req.method === 'POST') {
      // New room. The code is the invite -- it goes in a WhatsApp link, which is the only
      // distribution channel that matters here.
      let code = '';
      const b = new Uint8Array(5); crypto.getRandomValues(b);
      for (const v of b) code += CODE_ALPHABET[v % CODE_ALPHABET.length];
      const id = env.ROOMS.idFromName(code);
      const body = await req.json().catch(() => ({}));
      return env.ROOMS.get(id).fetch(new Request(`https://do/create?code=${code}`, {
        method: 'POST', body: JSON.stringify({ mode: body.mode || 'chakri', ante: body.ante || 4 }),
      }));
    }

    const code = (parts[1] || '').toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return json({ error: 'bad room' }, 400);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(new Request(`https://do/${parts.slice(2).join('/') || ''}${url.search}`, req));
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    this.sockets = new Set();
  }

  async load() {
    if (!this.game) this.game = (await this.state.storage.get('game')) || null;
    return this.game;
  }
  async save() {
    await this.state.storage.put('game', this.game);
    await this.state.storage.setAlarm(Date.now() + IDLE_MS);
  }
  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const ws of this.sockets) { try { ws.send(s); } catch { this.sockets.delete(ws); } }
  }
  /** Rooms nobody has touched in three days clean themselves up. */
  async alarm() { await this.state.storage.deleteAll(); }

  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\//, '');
    await this.load();

    if (path === 'create') {
      const { mode, ante } = await req.json();
      const token = crypto.randomUUID();
      this.game = {
        code: url.searchParams.get('code'),
        mode, ante,
        seed: (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0,
        players: [{ token, name: 'P1' }],
        shots: [],
        closed: false,
        updated: Date.now(),
      };
      await this.save();
      return json({ room: this.game.code, token, seat: 0, seed: this.game.seed, mode, ante });
    }
    if (!this.game) return json({ error: 'no such room' }, 404);

    if (path === 'join' && req.method === 'POST') {
      if (this.game.players.length >= MAX_PLAYERS) return json({ error: 'room full' }, 409);
      const body = await req.json().catch(() => ({}));
      const token = crypto.randomUUID();
      this.game.players.push({ token, name: String(body.name || `P${this.game.players.length + 1}`).slice(0, 16) });
      await this.save();
      const seat = this.game.players.length - 1;
      this.broadcast({ t: 'join', seat, players: this.names() });
      return json({ room: this.game.code, token, seat, seed: this.game.seed, mode: this.game.mode, ante: this.game.ante });
    }

    if (path === 'shot' && req.method === 'POST') {
      const s = await req.json().catch(() => ({}));
      const seat = this.game.players.findIndex((p) => p.token === s.token);
      if (seat < 0) return json({ error: 'not in this room' }, 403);
      // Idempotent by sequence number: a phone that loses signal mid-shot can safely retry.
      if (typeof s.n !== 'number' || s.n !== this.game.shots.length) {
        return json({ error: 'out of sequence', n: this.game.shots.length }, 409);
      }
      const shot = {
        seat, n: s.n,
        angle: clampNum(s.angle, -Math.PI * 2, Math.PI * 2),
        power: clampNum(s.power, 0, 1),
        foul: !!s.foul, fromLine: !!s.fromLine,
        at: Date.now(),
      };
      this.game.shots.push(shot);
      this.game.updated = Date.now();
      if (s.over) this.game.closed = true;
      await this.save();
      this.broadcast({ t: 'shot', shot });
      return json({ n: this.game.shots.length });
    }

    if (path === 'ws') {
      if (req.headers.get('upgrade') !== 'websocket') return json({ error: 'expected websocket' }, 426);
      const [client, server] = Object.values(new WebSocketPair());
      // Hibernation: an idle room costs nothing while two friends argue about whose turn it is.
      this.state.acceptWebSocket(server);
      this.sockets.add(server);
      server.send(JSON.stringify({ t: 'sync', ...this.snapshot(0) }));
      return new Response(null, { status: 101, webSocket: client });
    }

    // GET /room/:code?since=N -- the async poll. Cheap enough to hit every two seconds.
    const since = Number(url.searchParams.get('since') || 0);
    return json(this.snapshot(since));
  }

  webSocketClose(ws) { this.sockets.delete(ws); }
  webSocketError(ws) { this.sockets.delete(ws); }

  names() { return this.game.players.map((p) => p.name); }
  snapshot(since) {
    return {
      room: this.game.code, mode: this.game.mode, ante: this.game.ante, seed: this.game.seed,
      players: this.names(), closed: this.game.closed,
      n: this.game.shots.length,
      shots: this.game.shots.slice(Math.max(0, since)),
    };
  }
}

const clampNum = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0);
