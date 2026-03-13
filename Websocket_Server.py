import asyncio
import websockets

connected_clients = set()

async def handle_client(websocket):
    print("Client connected")
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            if message != "ping":

                print("Received:", message)
                for client in connected_clients:
                    if client != websocket:
                        await client.send(message)
    finally:
        connected_clients.discard(websocket)
        print("Client disconnected")

async def main():
    print("WebSocket server running on ws://localhost:9012")
    async with websockets.serve(handle_client, "localhost", 9012):
        await asyncio.Future()  # run forever

asyncio.run(main())