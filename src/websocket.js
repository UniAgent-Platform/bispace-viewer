// Keep sockets in a map keyed by liveBlockIndex
const sockets = {};

/**
 * Create or reuse a WebSocket connection for a given liveBlockIndex.
 *
 * @param {string} address - WebSocket address (e.g. ws://localhost:8765)
 * @param {number} liveBlockIndex - index of the live block this socket controls
 * @param {function} [onUpdate=updateLiveBlockPosition] - callback for received values
 */
export function connectWebSocket(address = "ws://localhost:8765", liveBlockIndex, onUpdate) {
    // If socket exists and is open, don’t recreate
    const existing = sockets[liveBlockIndex];
    if (existing && existing.readyState !== WebSocket.CLOSED) {
        console.log(`WebSocket for block ${liveBlockIndex} is already connected or connecting.`);
        return existing;
    }

    const socket = new WebSocket(address);
    sockets[liveBlockIndex] = socket; // store by index

    socket.addEventListener("open", () => {
        console.log(`WebSocket [${liveBlockIndex}] connection established.`);
    });

    socket.addEventListener("close", () => {
        console.warn(`WebSocket [${liveBlockIndex}] connection closed.`);
        delete sockets[liveBlockIndex]; // cleanup
    });

    socket.addEventListener("error", (e) => {
        console.error(`WebSocket [${liveBlockIndex}] error:`, e);
    });

    socket.addEventListener("message", (event) => {
        try {
            const data = JSON.parse(event.data);
            const valueArray = JSON.parse(data.value); // parse the stringified array
            if (Array.isArray(valueArray) && valueArray.length === 3) {
                onUpdate(valueArray, liveBlockIndex);
            }
        } catch (err) {
            console.warn(`Invalid WebSocket data for [${liveBlockIndex}]:`, event.data);
        }
    });

    return socket;
}

/**
 * Close all sockets
 */
export function disconnectAllWebSockets() {
    for (const [index, socket] of Object.entries(sockets)) {
        console.log(`Closing WebSocket [${index}]`);
        socket.close();
        delete sockets[index];
    }
}