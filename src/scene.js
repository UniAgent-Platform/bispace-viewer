import * as THREE from "three";
import {PointerLockControls} from "three-stdlib";

const raycaster = new THREE.Raycaster();
const intersectedObjects = [];

export function createScene() {


    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // sky blue
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(4, 4, 12); // pull camera back
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Basic light setup
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 10, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    // Start on click
    document.body.addEventListener('click', () => {
        controls.lock();
    });

// Controls
    const controls = new PointerLockControls(camera, renderer.domElement);
    scene.add(controls.getObject());

    return { scene, camera, renderer, controls };
}

// Function to detect block under the pointer
// function getIntersectedBlock() {
//     // const origin = camera.position.clone();
//     // const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
//     // drawRay(origin, direction, 10); // 10 units long
//
//     // Set the origin to the camera position
//     raycaster.ray.origin.copy(camera.position);
//
//     // Set the direction to where the camera is looking
//     raycaster.ray.direction.set(0, 0, -1).applyQuaternion(camera.quaternion);
//
//     // Intersect all block meshes
//     const intersects = raycaster.intersectObjects(scene.children, false);
//     if (intersects.length > 0) {
//         return intersects[0];
//     }
//     return null;
// }

// document.addEventListener('mousedown', (event) => {
//     const intersect = getIntersectedBlock();
//     console.log(intersect);
//     if (!intersect) return;
//
//     if (event.button === 0) {
//         // Left-click: Place block
//         const {point, face, object} = intersect;
//
//         // Get the position of the block hit
//         const blockPos = object.position.clone();
//
//         // Face normal tells us which direction to offset
//         const offset = face.normal.clone().round();
//         const placePos = blockPos.add(offset);
//
//         blockWorld.setBlock(
//             placePos.x,
//             placePos.y,
//             placePos.z,
//             1,
//             new THREE.MeshStandardMaterial({color: 0xff0000}) // example red block
//         );
//     } else if (event.button === 2) {
//         // Right-click: Remove block
//         const {point} = intersect;
//         const blockPos = point.clone().floor(); // snap to grid
//         blockWorld.removeBlock(blockPos.x, blockPos.y, blockPos.z);
//     }
// });
//
// function drawRay(origin, direction, length = 10, color = 0xffff00) {
//     const arrowHelper = new THREE.ArrowHelper(direction.clone().normalize(), origin, length, color);
//     scene.add(arrowHelper);
//     return arrowHelper;
// }


//------------------------------------------------------