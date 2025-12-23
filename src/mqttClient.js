import mqtt from "mqtt";

let client = null;

export function connectMQTT({
                                url = "ws://localhost:9090",
                                topic = "world/blocks",
                                onMessage,
                            }) {
    if (client) {
        console.warn("MQTT already connected");
        return client;
    }

    client = mqtt.connect(url, {
        clean: true,
        connectTimeout: 5000,
        reconnectPeriod: 1000,
    });

    client.on("connect", () => {
        console.log("MQTT connected:", url);
        client.subscribe(topic, (err) => {
            if (err) console.error("MQTT subscribe error:", err);
        });
    });

    client.on("message", (topic, payload) => {
        try {
            const msg = JSON.parse(payload.toString());
            onMessage?.(msg);
        } catch (err) {
            console.warn("Invalid MQTT JSON:", payload.toString());
        }
    });

    client.on("error", (err) => {
        console.error("MQTT error:", err);
    });

    client.on("close", () => {
        console.warn("MQTT connection closed");
        client = null;
    });

    return client;
}

export function disconnectMQTT() {
    if (client) {
        client.end(true);
        client = null;
    }
}
