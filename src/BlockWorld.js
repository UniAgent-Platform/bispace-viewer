import * as THREE from 'three';

export class BlockWorld {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.blocks = new Map(); // key: "x,y,z", value: { mesh, timer }

        this.handleMQTTWorldMessage = this.handleMQTTWorldMessage.bind(this);
    }

    _key(x, y, z) {
        return `${x},${y},${z}`;
    }

    _materialKey(material) {
        return material.color.getHexString();
    }

    //first version
    setBlock(x, y, z, size, material) {
        const key = this._key(x, y, z);
        if (this.blocks.has(key)) return;

        const geometry = new THREE.BoxGeometry(size, size, size / 4);
        const mesh = new THREE.Mesh(geometry, material.clone());
        mesh.position.set(x, y, z);
        this.world.add(mesh);

        const coordLbl = mesh.position.clone();
        coordLbl.z += size / 2 + 0.125;
        const label = this.createTextLabel(`${coordLbl.x}, ${coordLbl.y}`, coordLbl, 14);
        this.world.add(label);

        this.blocks.set(key, {mesh, timer: 0});
    }


    removeBlock(x, y, z) {
        const key = this._key(x, y, z);
        const block = this.blocks.get(key);
        if (block) {
            this.world.remove(block.mesh);
            this.blocks.delete(key);
        }
    }

    // Remove all blocks from the scene
    clearAll() {
        for (let [key, block] of this.blocks) {
            this.world.remove(block.mesh);
        }
        this.clearGroup(this.world);
        this.blocks.clear();
    }

    update() {
        for (let [key, block] of this.blocks) {
            if (block.blinkColor) {
                block.blinkTimer += 0.05;
                const on = Math.floor(block.blinkTimer * 2) % 4 === 0;
                block.mesh.material.color.copy(on ? block.blinkColor : block.blinkOriginal);

            } else {
                // existing timer and colour animation
                block.timer = (block.timer + 0.01) % 4;
                const color = new THREE.Color(0x00ee00).lerp(
                    new THREE.Color(0x00bb00),
                    Math.sin(block.timer * Math.PI / 2)
                );
                block.mesh.material.color.set(color);
            }

            // Other example: bobbing blocks
            // const matrix = new THREE.Matrix4().makeTranslation(0, Math.sin(performance.now() / 120) * 0.001, 0);
            // block.mesh.updateMatrix();
            // block.mesh.geometry.applyMatrix4( matrix );
        }
    }

    handleMQTTWorldMessage(msg) {

        switch (msg.action) {
            case "blink_start": {
                const {key, color} = msg.params ?? {};
                this.startBlink(key, color);
                break;
            }

            case "blink_stop": {
                const {key} = msg.params ?? {};
                this.stopBlink(key);
                break;
            }
        }
    }

    startBlink(keyOrCoords, color) {
        // keyOrCoords may be an array [x, y, z] or the key string
        const key = Array.isArray(keyOrCoords)
            ? this._key(...keyOrCoords)
            : keyOrCoords;
        const block = this.blocks.get(key);
        if (!block) return;
        // console.log("Block found = ", block)

        block.blinkOriginal = block.mesh.material.color.clone();
        block.blinkColor = new THREE.Color(color);
        block.blinkTimer = 0;
    }

    stopBlink(keyOrCoords) {
        const key = Array.isArray(keyOrCoords)
            ? this._key(...keyOrCoords)
            : keyOrCoords;
        const block = this.blocks.get(key);
        if (!block || !block.blinkColor) return;

        block.mesh.material.color.copy(block.blinkOriginal);
        delete block.blinkOriginal;
        delete block.blinkColor;
        delete block.blinkTimer;
    }

    createTextLabel(text, position, fontSize = 28) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        // const fontSize = 42;

        canvas.width = 512;
        canvas.height = 128;

        // Style text
        context.font = `${fontSize}px Arial`;
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        // Create sprite
        const material = new THREE.SpriteMaterial({map: texture, transparent: true});
        const sprite = new THREE.Sprite(material);

        // Scale and position sprite
        const scale = 1;
        sprite.scale.set(2 * scale, 0.5 * scale, 1);
        sprite.position.set(position.x, position.y, position.z);

        return sprite;
    }

    clearGroup(group) {
        while (group.children.length > 0) {
            const child = group.children[0];

            if (child.geometry) {
                child.geometry.dispose();
            }

            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }

            if (child.material && child.material.map) {
                child.material.map.dispose();
            }

            group.remove(child);
        }
    }
}