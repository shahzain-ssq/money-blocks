"""Lightweight WebSocket broadcaster for institution-scoped events."""
import asyncio
import hmac
import json
import os
import signal
from typing import Dict, Optional, Set
from urllib.parse import parse_qs, urlparse

import websockets
from aiohttp import web

connections: Dict[int, Set[websockets.WebSocketServerProtocol]] = {}

ADMIN_TOKEN = os.environ.get("WS_ADMIN_TOKEN") or os.environ.get("ADMIN_TOKEN")
if not ADMIN_TOKEN:
    raise RuntimeError(
        "WS_ADMIN_TOKEN (or ADMIN_TOKEN) environment variable must be set for admin endpoints"
    )

WS_SERVER_HOST = os.environ.get("WS_SERVER_HOST", "127.0.0.1")
WS_SERVER_PORT = int(os.environ.get("WS_SERVER_PORT", "8787"))
ADMIN_PORT = int(os.environ.get("WS_ADMIN_PORT", "8766"))
PRUNE_INTERVAL = 30
MAX_ADMIN_BYTES = 65536

ALLOWED_ORIGINS = set()
for origin in os.environ.get("WS_ALLOWED_ORIGINS", "").split(","):
    normalized_origin = origin.strip().rstrip("/")
    if normalized_origin:
        ALLOWED_ORIGINS.add(normalized_origin)

if not ALLOWED_ORIGINS:
    raise RuntimeError(
        "WS_ALLOWED_ORIGINS environment variable must be set for production security"
    )


async def register(ws, institution_id: int):
    connections.setdefault(institution_id, set()).add(ws)
    print(
        json.dumps(
            {"event": "connected", "institution_id": institution_id, "remote": str(ws.remote_address)}
        )
    )


async def unregister(ws, institution_id: int):
    if institution_id in connections:
        connections[institution_id].discard(ws)
        if not connections[institution_id]:
            connections.pop(institution_id, None)
    print(
        json.dumps(
            {
                "event": "disconnected",
                "institution_id": institution_id,
                "remote": str(ws.remote_address),
            }
        )
    )


def _normalize_origin(origin: Optional[str]) -> Optional[str]:
    return origin.rstrip("/") if origin else origin


async def handler(ws, path):
    origin = ws.request_headers.get("Origin")
    normalized_origin = _normalize_origin(origin)
    if not normalized_origin or normalized_origin not in ALLOWED_ORIGINS:
        await ws.close(code=1008, reason="origin not allowed")
        return

    parsed = urlparse(path or "")
    query_params = parse_qs(parsed.query)
    try:
        institution_raw = query_params.get("institution_id", [None])[0]
        institution_id = int(institution_raw)
        if institution_id <= 0:
            raise ValueError("institution_id must be positive")
    except (TypeError, ValueError):
        await ws.close(code=1008, reason="Missing or invalid institution_id")
        return

    await register(ws, institution_id)
    try:
        # Discard any client messages; this server only broadcasts
        async for _ in ws:
            pass
    finally:
        await unregister(ws, institution_id)


async def _safe_send(ws, payload: str, institution_id: int):
    try:
        await ws.send(payload)
        return True
    except Exception as exc:  # broad on purpose for robustness
        print(
            json.dumps(
                {
                    "event": "send_error",
                    "institution_id": institution_id,
                    "remote": str(ws.remote_address),
                    "error": str(exc),
                }
            )
        )
        return False


async def broadcast(message: dict):
    institution_id = message.get("institution_id")
    if not isinstance(institution_id, int) or institution_id <= 0:
        return 0

    try:
        payload = json.dumps(message, ensure_ascii=False)
    except (TypeError, ValueError) as exc:
        print(json.dumps({"event": "encode_error", "error": str(exc)}))
        return 0
    recipients = list(connections.get(institution_id, set()))
    if not recipients:
        return 0

    results = await asyncio.gather(
        *(_safe_send(ws, payload, institution_id) for ws in recipients),
        return_exceptions=True,
    )

    delivered = 0
    for ws, result in zip(recipients, results):
        if result is True:
            delivered += 1
            continue
        await unregister(ws, institution_id)
        if isinstance(result, Exception):
            print(
                json.dumps(
                    {
                        "event": "send_exception",
                        "institution_id": institution_id,
                        "remote": str(ws.remote_address),
                        "error": str(result),
                    }
                )
            )

    return delivered


async def admin_broadcast(request):
    header_token = request.headers.get("X-WS-TOKEN", "")
    if not (header_token and hmac.compare_digest(str(header_token), str(ADMIN_TOKEN))):
        print(json.dumps({"event": "admin_auth_failed", "remote": request.remote}))
        return web.json_response({"ok": False, "error": "unauthorized"}, status=401)

    if request.content_length and request.content_length > MAX_ADMIN_BYTES:
        return web.json_response({"ok": False, "error": "payload too large"}, status=413)

    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "invalid json"}, status=400)

    if not isinstance(data, dict):
        return web.json_response({"ok": False, "error": "invalid payload"}, status=400)

    institution_id = data.get("institution_id")
    if not isinstance(institution_id, int) or institution_id <= 0:
        return web.json_response({"ok": False, "error": "invalid institution_id"}, status=400)

    delivered = await broadcast(data)
    print(
        json.dumps(
            {
                "event": "admin_broadcast",
                "institution_id": institution_id,
                "delivered_to": delivered,
                "remote": request.remote,
            }
        )
    )

    return web.json_response({"ok": True, "delivered_to": delivered})


async def healthcheck(_request):
    total_connections = sum(len(sockets) for sockets in connections.values())
    return web.json_response(
        {"ok": True, "connections": total_connections, "institutions": len(connections)}
    )


async def prune_connections():
    while True:
        await asyncio.sleep(PRUNE_INTERVAL)
        for institution_id, sockets in list(connections.items()):
            for ws in list(sockets):
                if ws.closed:
                    print(
                        json.dumps(
                            {
                                "event": "prune",
                                "institution_id": institution_id,
                                "remote": str(ws.remote_address),
                            }
                        )
                    )
                    await unregister(ws, institution_id)


async def start_servers():
    ws_server = await websockets.serve(handler, WS_SERVER_HOST, WS_SERVER_PORT)

    app = web.Application()
    app.router.add_get("/health", healthcheck)
    app.router.add_post("/admin/broadcast", admin_broadcast)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, WS_SERVER_HOST, ADMIN_PORT)
    await site.start()

    loop = asyncio.get_event_loop()
    if hasattr(loop, "create_task"):
        prune_task = loop.create_task(prune_connections())
    else:
        prune_task = asyncio.ensure_future(prune_connections())

    print(
        "WebSocket listening on "
        f"{WS_SERVER_HOST}:{WS_SERVER_PORT}, admin HTTP on {ADMIN_PORT}"
    )

    stop_event = asyncio.Event()

    def signal_handler():
        stop_event.set()

    loop.add_signal_handler(signal.SIGTERM, signal_handler)
    loop.add_signal_handler(signal.SIGINT, signal_handler)

    try:
        await stop_event.wait()
    finally:
        ws_server.close()
        await ws_server.wait_closed()
        await runner.cleanup()
        prune_task.cancel()
        try:
            await prune_task
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    if hasattr(asyncio, "run"):
        asyncio.run(start_servers())
    else:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(start_servers())
