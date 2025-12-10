"""Lightweight WebSocket broadcaster for institution-scoped events."""
import asyncio
import json
import os
from typing import Dict, Set

import websockets
from aiohttp import web

connections: Dict[int, Set[websockets.WebSocketServerProtocol]] = {}
# Align token name with PHP broadcaster (WS_ADMIN_TOKEN) while still
# accepting ADMIN_TOKEN for backward compatibility.
ADMIN_TOKEN = (
    os.environ.get("ADMIN_TOKEN")
    or os.environ.get("WS_ADMIN_TOKEN")
    or "change-me"
)
WS_SERVER_PORT = 8765
ADMIN_PORT = 8766


async def register(ws, institution_id: int):
    connections.setdefault(institution_id, set()).add(ws)


async def unregister(ws, institution_id: int):
    if institution_id in connections:
        connections[institution_id].discard(ws)
        if not connections[institution_id]:
            connections.pop(institution_id)


async def handler(ws, path):
    query = ws.path.split('?', 1)[1] if '?' in ws.path else ''
    params = dict(part.split('=') for part in query.split('&') if '=' in part)
    institution_id = int(params.get('institution_id', 0))
    await register(ws, institution_id)
    try:
        async for _ in ws:
            pass
    finally:
        await unregister(ws, institution_id)


async def broadcast(message: dict):
    institution_id = message.get('institution_id')
    payload = json.dumps(message)
    for ws in list(connections.get(institution_id, [])):
        await ws.send(payload)


async def admin_broadcast(request):
    if not ADMIN_TOKEN:
        raise RuntimeError("ADMIN_TOKEN environment variable must be set for admin endpoints")
    if request.headers.get('X-WS-TOKEN') != ADMIN_TOKEN:
        return web.Response(status=401, text='unauthorized')
    data = await request.json()
    await broadcast(data)
    return web.json_response({'delivered_to': len(connections.get(data.get('institution_id'), []))})


async def start_servers():
    ws_server = await websockets.serve(handler, '0.0.0.0', WS_SERVER_PORT, ping_interval=None)
    app = web.Application()
    app.router.add_post('/admin/broadcast', admin_broadcast)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', ADMIN_PORT)
    await site.start()
    print(f"WebSocket listening on {WS_SERVER_PORT}, admin HTTP on {ADMIN_PORT}")
    await ws_server.wait_closed()


if __name__ == '__main__':
    asyncio.run(start_servers())
