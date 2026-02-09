import {ENDPOINTS, FORMATS, DEFAULT_GRID} from "./config.js";
import {BlockWorld} from './BlockWorld.js';
import {parseBigraphXML, parseBigraphXML_singleBRoot} from './BigraphGridXMLParser.js';
import {fetchCdoModel, fetchGrid} from "./services.js";

import * as THREE from 'three';
import {createScene} from "./scene.js";
import {connectWebSocket, disconnectAllWebSockets} from "./websocket.js";
import {subscribeMultipleDrones, disconnectAllRosConnections} from "./ros2.js";

import { connectMQTT, disconnectMQTT } from "./mqttClient.js";

const {scene, camera, renderer, controls} = createScene();

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const move = {forward: false, backward: false, left: false, right: false};
const speed = 5; // units per second
let prevTime = performance.now();

const mouse = new THREE.Vector2();
const world = new THREE.Group();
scene.add(world);
// Rotate so +Z becomes "up", +Y becomes left-to-right, and +X becomes top-to-bottom
world.rotation.order = 'XYZ'; // default, but being explicit
world.rotation.x = -Math.PI / 2; // Rotate -90° around X

const blockWorld = new BlockWorld(scene, world);
const grassMaterial = new THREE.MeshStandardMaterial({color: 0x00ff00});

let resolutionFactor = 0.2;
let liveBlock = [];
let numOfLiveBlocks = 4;
let connectionMode = "websocket";
let rosUnsubscribeFunctions = [];

let rowsSlider, colsSlider, stepXSlider, stepYSlider;

// Add a sample block

function initLiveBlock(resolutionFactor, numOfBlocks = 4) {
    // clear previous blocks if re-initializing
    liveBlock.forEach(block => world.remove(block));
    liveBlock = [];

    // const liveBlockMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff });

    for (let i = 0; i < numOfBlocks; i++) {
        const color = new THREE.Color().setHSL((0.6 + i * 0.1) % 1.0, 1.0, 0.5);
        const liveBlockMaterial = new THREE.MeshStandardMaterial({color});
        const block = new THREE.Mesh(
            new THREE.BoxGeometry(
                1 * resolutionFactor,
                1 * resolutionFactor,
                1 * resolutionFactor
            ),
            liveBlockMaterial
        );

        // Example placement: offset each block in x-direction
        block.position.set(0, 0, 1.5);

        world.add(block);
        liveBlock.push(block);
    }
}

// Draw Grid
for (let x = 0; x <= 5; x++) {
    for (let y = 0; y <= 5; y++) {
        blockWorld.setBlock(x, y, 0, resolutionFactor, grassMaterial); // flat terrain at y=0
    }
}

// Animate
function animate() {
    requestAnimationFrame(animate); //!start

    const time = performance.now();
    const delta = (time - prevTime) / 1000; // in seconds

    // Movement
    direction.z = Number(move.forward) - Number(move.backward);
    direction.x = Number(move.right) - Number(move.left);
    direction.normalize(); // diagonal movement

    velocity.x = direction.x * speed * delta;
    velocity.z = direction.z * speed * delta;

    controls.moveRight(velocity.x);
    controls.moveForward(velocity.z);

    // Update blocks (change colors over time)
    blockWorld.update();

    renderer.render(scene, camera);//!end
    prevTime = time;
}

function onUpdateBlockAction(data) {
    if (data.action === 'blink_start' && data.params?.key) {
        // colour may be a CSS name or #rrggbb
        const colour = data.params.color || '#ff0000';
        blockWorld.startBlink(data.params.key, colour);
        return;
    }
    if (data.action === 'blink_stop' && data.params?.key) {
        blockWorld.stopBlink(data.params.key);
        return;
    }
}

function updateLiveBlockPosition([x, y, z], liveBlockIndex = 0) {
    const scale = resolutionFactor;
    
    if (!liveBlock || liveBlock.length <= liveBlockIndex) {
        console.warn(`liveBlock index ${liveBlockIndex} invalid, current length: ${liveBlock ? liveBlock.length : 0}`);
        return;
    }
    
    if (!liveBlock[liveBlockIndex]) {
        console.warn(`liveBlock[${liveBlockIndex}] does not exist`);
        return;
    }
    
    liveBlock[liveBlockIndex].position.set(x, y, 1.5);
}

function bindSlider(id, valueId) {
    const slider = document.getElementById(id);
    const valueEl = document.getElementById(valueId);
    slider.addEventListener('input', () => {
        valueEl.textContent = slider.value;
    });
    return slider;
}

async function fetchSampleAndRender(filename, version = 0) {
    console.log("Loading sample " + filename + " ...");
    fetch(filename)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();
        })
        .then(xmlString => {
            let parsed;
            if (version === 1) {
                // Use single-root parser
                parsed = parseBigraphXML_singleBRoot(xmlString);
            } else {
                // Default: multi-root parser
                parsed = parseBigraphXML(xmlString);
            }

            const {cells, linkMap} = parsed;

            blockWorld.clearAll();
            initLiveBlock(resolutionFactor, numOfLiveBlocks);

            for (const cell of cells) {
                // console.log(`Index: ${cell.index}, Locale: ${cell.locale}, Point: x=${cell.point.x}, y=${cell.point.y}`);
                blockWorld.setBlock(
                    cell.point.x,
                    cell.point.y,
                    1,
                    resolutionFactor,
                    grassMaterial
                );
            }
        })
        .catch(error => {
            console.error("Failed to fetch or parse XML:", error);
        });
}

async function fetchGridAndRender(rows = 3, cols = 3, stepSizeX = 1.0, stepSizeY = 1.0) {
    console.log('Generating bigrid ...');

    // 1) Call service
    const {xmlString, resolutionFactor} = await fetchGrid({
        rows,
        cols,
        stepX: stepSizeX,
        stepY: stepSizeY,
    });

    // 2) Parse XML
    const {cells, linkMap} = parseBigraphXML_singleBRoot(xmlString, true);

    // 3) Map roots → 3D blocks
    blockWorld.clearAll();
    initLiveBlock(resolutionFactor, numOfLiveBlocks);
    for (const cell of cells) {
        blockWorld.setBlock(cell.point.x, cell.point.y, 1, resolutionFactor, grassMaterial);
    }

    console.log("Loaded bigraph with", cells.length, "roots");
}

async function fetchCdoAndRender(address, repoPath, coordinatesAsLinks = false, {signal} = {}) {
    console.log("Connecting to CDO ...");

    // 1) Fetch & normalize
    const {xmlString, resolutionFactor} = await fetchCdoModel({
        address,
        repoPath,
        format: FORMATS.xml, // server returns JSON with XML content field
        signal,
    });

    // 2) Parse XML
    const {cells, linkMap} = parseBigraphXML_singleBRoot(xmlString, coordinatesAsLinks);

    // 3) Map roots → 3D blocks
    blockWorld.clearAll();
    initLiveBlock(resolutionFactor, numOfLiveBlocks);
    for (const cell of cells) {
        blockWorld.setBlock(cell.point.x, cell.point.y, 1, resolutionFactor, grassMaterial);
    }

    console.log("Loaded bigraph with", cells.length, "roots");
}


document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById("agentSlider");
    const valueLabel = document.getElementById("agentCountValue");
    const buttonContainer = document.getElementById("agentButtons");
    const modeSelect = document.getElementById("connectionMode");
    const rosHostInput = document.getElementById("rosBridgeHost");

    rowsSlider = bindSlider('rowsSlider', 'rowsValue');
    colsSlider = bindSlider('colsSlider', 'colsValue');
    stepXSlider = bindSlider('stepXSlider', 'stepXValue');
    stepYSlider = bindSlider('stepYSlider', 'stepYValue');

    connectionMode = modeSelect.value;

    modeSelect.addEventListener("change", (e) => {
        connectionMode = e.target.value;
        console.log(`Connection mode switched: ${connectionMode}`);
        renderAgentButtons(+slider.value);
    });

    rosHostInput.addEventListener("change", () => {
        if (connectionMode === "ros2") {
            renderAgentButtons(+slider.value);
        }
    });

    // Initial render
    renderAgentButtons(+slider.value);

    initLiveBlock(resolutionFactor, numOfLiveBlocks);

    animate();

    // Update on slider change
    slider.addEventListener("input", (e) => {
        const count = +e.target.value;
        valueLabel.textContent = count;
        renderAgentButtons(count);
    });

    // Prevent the right-click context menu
    document.addEventListener('contextmenu', (event) => event.preventDefault());

    // Resize support
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });


    const uploadInput = document.getElementById("xmiUpload");
    const uploadBtn = document.getElementById("uploadXmiBtn");
    const xmiModeSelect = document.getElementById("xmiMode");

    uploadBtn.addEventListener("click", async () => {
        const file = uploadInput.files?.[0];
        if (!file) {
            alert("Please select an XMI file first.");
            return;
        }

        // You can load the file locally via Blob URL
        const localUrl = URL.createObjectURL(file);
        const mode = xmiModeSelect.value;

        console.log(`Uploading XMI: ${file.name}, mode: ${mode}`);

        try {
            if (mode === "multi") {
                await fetchSampleAndRender(localUrl, 0);
            } else {
                await fetchSampleAndRender(localUrl, 1);
            }
        } catch (err) {
            console.error("Error rendering XMI:", err);
        } finally {
            // Free the blob URL when done
            URL.revokeObjectURL(localUrl);
        }
    });


    document.getElementById('fetchSampleModel_0').addEventListener('click', (event) => {
        const stepSize = event.currentTarget.dataset.stepsize;
        console.log("fetchSampleModel_0", stepSize);
        resolutionFactor = stepSize;
        fetchSampleAndRender('/cfswarmwalker_1.0f_singleRoot.xmi', 1).then(r => {
            console.log("Finished.")
        }); //single-root model file
    });

    document.getElementById('fetchSampleModel_A').addEventListener('click', (event) => {
        const stepSize = event.currentTarget.dataset.stepsize;
        console.log("fetchSampleModel_A", stepSize)
        resolutionFactor = stepSize;
        fetchSampleAndRender('/xrpals-home-0.25f.xmi').then(r => {
            console.log("Finished.")
        }); //multi-root model file
    });

    document.getElementById('fetchSampleModel_B').addEventListener('click', (event) => {
        const stepSize = event.currentTarget.dataset.stepsize;
        console.log("fetchSampleModel_B", stepSize)
        resolutionFactor = stepSize;
        fetchSampleAndRender('/xrpals-home-0.5f.xmi').then(r => {
            console.log("Finished.")
        }); //multi-root model file
    });

    document.getElementById('fetchServiceAPI').addEventListener('click', () => {
        // Fetch Slider values
        const rows = +document.getElementById("rowsSlider").value;
        const cols = +document.getElementById("colsSlider").value;
        const stepX = +document.getElementById("stepXSlider").value;
        const stepY = +document.getElementById("stepYSlider").value;

        console.log(`Call API with rows=${rows}, cols=${cols}, stepX=${stepX}, stepY=${stepY}`);

        try {
            fetchGridAndRender(rows, cols, stepX, stepY).then(r => {
                console.log("Finished");
            });
        } catch (err) {
            console.error("Failed to generate bigraph grid:", err);
        }
    });

    document.getElementById('connectCDO').addEventListener('click', (event) => {
        // Read dataset (stepSize)
        const stepSize = event.currentTarget.dataset.stepsize;

        // CDO values
        const address = document.getElementById('cdoHost').value;
        const repoPath = document.getElementById('cdoRepo').value;
        const coordinatesAsLinks = document.getElementById('coordAsLinks').checked;

        try {
            console.log("connectCDO clicked with parameters:", {
                address,
                repoPath,
                coordinatesAsLinks
            });
            // Choose FORMATS.json if you expect JSON; default is XML text
            fetchCdoAndRender(address, repoPath, coordinatesAsLinks).then(r => {
                console.log("Finished.")
            });
        } catch (err) {
            console.error("CDO connection failed:", err);
        }


    });

    document.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'KeyW':
                move.forward = true;
                break;
            case 'KeyS':
                move.backward = true;
                break;
            case 'KeyA':
                move.left = true;
                break;
            case 'KeyD':
                move.right = true;
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW':
                move.forward = false;
                break;
            case 'KeyS':
                move.backward = false;
                break;
            case 'KeyA':
                move.left = false;
                break;
            case 'KeyD':
                move.right = false;
                break;
        }
    });

    document.addEventListener('mousemove', (event) => {
        // Convert mouse position to normalized device coordinates (-1 to +1) for raycasting
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
        // console.log(mouse);
    });

    connectMQTT({
        url: "ws://localhost:9090",
        topic: "world/blocks",
        onMessage: blockWorld.handleMQTTWorldMessage,
    });

    function renderAgentButtons(count) {
        disconnectAllWebSockets();
        disconnectAllRosConnections();
        rosUnsubscribeFunctions.forEach(unsub => unsub());
        rosUnsubscribeFunctions = [];
        
        buttonContainer.innerHTML = "";

        if (connectionMode === "websocket") {
            for (let i = 0; i < count; i++) {
                const btn = document.createElement("button");
                const port = 8765 + i;
                const url = `ws://localhost:${port}`;

                btn.className = "btn";
                btn.id = `reconnectBtn_${i}`;
                btn.textContent = `Reconnect ${url}`;

                btn.addEventListener("click", () => {
                    console.log(`Attempting to reconnect WebSocket: ${url}`);
                    connectWebSocket(url, i, updateLiveBlockPosition);
                });

                buttonContainer.appendChild(btn);
            }
        } else {
            const rosHost = document.getElementById("rosBridgeHost").value || "localhost:9090";
            const startCf = 231;
            
            console.log(`Connecting ROS2 mode: ${rosHost}, drone count: ${count}, cf${startCf} to cf${startCf + count - 1}`);
            
            const unsubscribeFuncs = subscribeMultipleDrones(rosHost, startCf, count, updateLiveBlockPosition);
            rosUnsubscribeFunctions = unsubscribeFuncs;
            
            for (let i = 0; i < count; i++) {
                const cfNumber = startCf + i;
                const btn = document.createElement("button");
                btn.className = "btn";
                btn.id = `rosStatusBtn_${i}`;
                btn.textContent = `cf${cfNumber} (ROS2)`;
                btn.disabled = true;
                buttonContainer.appendChild(btn);
            }
        }

        numOfLiveBlocks = count;
        initLiveBlock(resolutionFactor, numOfLiveBlocks);
    }
});
