// ROS2 WebSocket connection management using rosbridge WebSocket protocol

const rosConnections = {};
const topicHandlers = {};

/**
 * Connect to ROS bridge WebSocket server
 * @param {string} host - ROS bridge host address (e.g., "localhost:9090" or "ws://localhost:9090")
 * @returns {WebSocket} WebSocket connection
 */
function connectRosBridge(host = "localhost:9090") {
    let wsUrl = host;
    if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
        wsUrl = `ws://${wsUrl}`;
    }
    
    let existingWs = null;
    let existingUrl = null;
    for (const [url, ws] of Object.entries(rosConnections)) {
        if (url === wsUrl || (ws.url && ws.url === wsUrl)) {
            existingWs = ws;
            existingUrl = ws.url || url;
            break;
        }
    }
    
    if (existingWs && (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING)) {
        console.log(`ROS bridge connection exists: ${existingUrl} (requested: ${wsUrl}), state: ${existingWs.readyState === WebSocket.OPEN ? 'OPEN' : 'CONNECTING'}`);
        return existingWs;
    }
    
    if (existingWs && (existingWs.readyState === WebSocket.CLOSED || existingWs.readyState === WebSocket.CLOSING)) {
        console.log(`Cleaning up closed ROS bridge connection: ${existingUrl || wsUrl}`);
        if (existingUrl) {
            delete rosConnections[existingUrl];
            delete topicHandlers[existingUrl];
        }
        if (rosConnections[wsUrl]) {
            delete rosConnections[wsUrl];
        }
        if (topicHandlers[wsUrl]) {
            delete topicHandlers[wsUrl];
        }
    }
    
    const ws = new WebSocket(wsUrl);
    rosConnections[wsUrl] = ws;
    
    if (!topicHandlers[wsUrl]) {
        topicHandlers[wsUrl] = {};
    }
    
    ws.addEventListener("open", () => {
        const actualUrl = ws.url;
        console.log(`ROS bridge connection established: ${actualUrl} (requested: ${wsUrl})`);
        
        if (actualUrl !== wsUrl) {
            rosConnections[actualUrl] = ws;
            if (rosConnections[wsUrl]) {
                delete rosConnections[wsUrl];
            }
            
            if (topicHandlers[wsUrl]) {
                if (!topicHandlers[actualUrl]) {
                    topicHandlers[actualUrl] = {};
                }
                Object.assign(topicHandlers[actualUrl], topicHandlers[wsUrl]);
                delete topicHandlers[wsUrl];
                console.log(`Migrated topic handlers from ${wsUrl} to ${actualUrl}`, {
                    topics: Object.keys(topicHandlers[actualUrl])
                });
            } else {
                if (!topicHandlers[actualUrl]) {
                    topicHandlers[actualUrl] = {};
                }
            }
        } else {
            if (!topicHandlers[actualUrl]) {
                topicHandlers[actualUrl] = {};
            }
        }
        
        if (!ws._messageDispatcherAdded) {
            const messageDispatcher = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.op === "publish" && data.topic && data.msg) {
                        const url = ws.url;
                        const handler = topicHandlers[url] && topicHandlers[url][data.topic];
                        if (handler) {
                            handler(data.msg);
                        } else {
                            console.warn(`Topic handler not found: ${data.topic}`, {
                                url,
                                availableTopics: topicHandlers[url] ? Object.keys(topicHandlers[url]) : [],
                                topicHandlersKeys: Object.keys(topicHandlers)
                            });
                        }
                    }
                } catch (err) {
                    console.warn(`Failed to parse ROS2 message:`, err, event.data);
                }
            };
            
            ws.addEventListener("message", messageDispatcher);
            ws._messageDispatcherAdded = true;
            console.log(`Message dispatcher added to connection: ${actualUrl}`);
        }
    });
    
    ws.addEventListener("close", () => {
        console.warn(`ROS bridge connection closed: ${wsUrl}`);
        delete rosConnections[wsUrl];
        ws._messageDispatcherAdded = false;
    });
    
    ws.addEventListener("error", (e) => {
        console.error(`ROS bridge connection error: ${wsUrl}`, e);
    });
    
    return ws;
}

/**
 * Subscribe to ROS2 topic
 * @param {string} host - ROS bridge host address
 * @param {string} topic - Topic name (e.g., "/cf231/pose")
 * @param {string} messageType - Message type (e.g., "geometry_msgs/PoseStamped")
 * @param {function} onMessage - Message callback function
 * @param {number} liveBlockIndex - Corresponding live block index
 * @returns {function} Unsubscribe function
 */
export function subscribeRosTopic(host, topic, messageType, onMessage, liveBlockIndex = 0) {
    const ws = connectRosBridge(host);
    
    if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener("open", () => {
            doSubscribe(ws, topic, messageType, onMessage, liveBlockIndex);
        });
    } else if (ws.readyState === WebSocket.OPEN) {
        doSubscribe(ws, topic, messageType, onMessage, liveBlockIndex);
    } else {
        console.error(`Cannot subscribe to topic ${topic}, WebSocket state: ${ws.readyState}`);
        return () => {};
    }
    
    return () => {
        unsubscribeRosTopic(ws, topic);
    };
}

function doSubscribe(ws, topic, messageType, onMessage, liveBlockIndex) {
    let wsUrl = ws.url;
    if (!wsUrl) {
        for (const [url, conn] of Object.entries(rosConnections)) {
            if (conn === ws) {
                wsUrl = url;
                break;
            }
        }
    }
    
    if (!wsUrl) {
        wsUrl = `temp_${Date.now()}`;
        rosConnections[wsUrl] = ws;
    }
    
    if (!topicHandlers[wsUrl]) {
        topicHandlers[wsUrl] = {};
    }
    
    if (ws.readyState === WebSocket.OPEN && !ws._messageDispatcherAdded) {
        const messageDispatcher = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.op === "publish" && data.topic && data.msg) {
                    const actualUrl = ws.url;
                    const handler = topicHandlers[actualUrl] && topicHandlers[actualUrl][data.topic];
                    if (handler) {
                        handler(data.msg);
                    } else {
                        console.warn(`Topic handler not found: ${data.topic}`, {
                            actualUrl,
                            availableTopics: topicHandlers[actualUrl] ? Object.keys(topicHandlers[actualUrl]) : [],
                            topicHandlersKeys: Object.keys(topicHandlers)
                        });
                    }
                }
            } catch (err) {
                console.warn(`Failed to parse ROS2 message:`, err, event.data);
            }
        };
        
        ws.addEventListener("message", messageDispatcher);
        ws._messageDispatcherAdded = true;
        console.log(`Message dispatcher added to open connection: ${wsUrl}`);
    }
    
    const topicHandler = (msg) => {
        try {
            if (messageType === "geometry_msgs/PoseStamped") {
                const pose = msg.pose;
                if (pose && pose.position) {
                    const x = pose.position.x || 0;
                    const y = pose.position.y || 0;
                    const z = pose.position.z || 0;
                    
                    onMessage([x, y, z], liveBlockIndex);
                } else {
                    console.warn(`Invalid message format, missing pose.position:`, msg);
                }
            } else {
                onMessage(msg, liveBlockIndex);
            }
        } catch (err) {
            console.error(`Error processing message for topic ${topic}:`, err, msg);
        }
    };
    
    topicHandlers[wsUrl][topic] = topicHandler;
    console.log(`Registered topic handler: ${topic} (URL: ${wsUrl})`, {
        registeredTopics: Object.keys(topicHandlers[wsUrl]),
        allUrls: Object.keys(topicHandlers)
    });
    
    if (ws.readyState === WebSocket.OPEN) {
        const subscribeMsg = {
            op: "subscribe",
            topic: topic,
            type: messageType
        };
        
        ws.send(JSON.stringify(subscribeMsg));
        console.log(`Subscribed to ROS2 topic: ${topic} (type: ${messageType})`);
    } else {
        console.warn(`Cannot subscribe to topic ${topic}, WebSocket state: ${ws.readyState}, waiting for connection...`);
        ws.addEventListener("open", () => {
            const subscribeMsg = {
                op: "subscribe",
                topic: topic,
                type: messageType
            };
            ws.send(JSON.stringify(subscribeMsg));
            console.log(`Subscribed to ROS2 topic after connection opened: ${topic}`);
        }, { once: true });
    }
}

function unsubscribeRosTopic(ws, topic) {
    if (ws.readyState === WebSocket.OPEN) {
        const unsubscribeMsg = {
            op: "unsubscribe",
            topic: topic
        };
        ws.send(JSON.stringify(unsubscribeMsg));
        console.log(`Unsubscribed from ROS2 topic: ${topic}`);
        
        const wsUrl = ws.url;
        if (topicHandlers[wsUrl] && topicHandlers[wsUrl][topic]) {
            delete topicHandlers[wsUrl][topic];
        }
    }
}

export function disconnectAllRosConnections() {
    for (const [url, ws] of Object.entries(rosConnections)) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            console.log(`Closing ROS bridge connection: ${url}`);
            if (topicHandlers[url]) {
                for (const topic of Object.keys(topicHandlers[url])) {
                    unsubscribeRosTopic(ws, topic);
                }
            }
            ws.close();
        }
        delete rosConnections[url];
        delete topicHandlers[url];
    }
}

/**
 * Subscribe to multiple drone ROS2 topics
 * @param {string} host - ROS bridge host address
 * @param {number} startCf - Starting Crazyflie number (e.g., 231)
 * @param {number} count - Number of drones
 * @param {function} onUpdate - Position update callback function
 * @returns {Array} Array of unsubscribe functions
 */
export function subscribeMultipleDrones(host, startCf, count, onUpdate) {
    const unsubscribeFunctions = [];
    
    for (let i = 0; i < count; i++) {
        const cfNumber = startCf + i;
        const topic = `/cf${cfNumber}/pose`;
        const messageType = "geometry_msgs/PoseStamped";
        
        const unsubscribe = subscribeRosTopic(host, topic, messageType, onUpdate, i);
        unsubscribeFunctions.push(unsubscribe);
    }
    
    return unsubscribeFunctions;
}

