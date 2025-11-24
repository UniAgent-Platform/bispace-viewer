import * as THREE from 'three';

export class BlockWorld {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.blocks = new Map(); // key: "x,y,z", value: { mesh, timer }
    }

    _key(x, y, z) {
        return `${x},${y},${z}`;
    }
    _materialKey(material) {
        // Assumes you're identifying materials by their color
        return material.color.getHexString();
    }

    //first version
    setBlock(x, y, z, size, material) {
        const key = this._key(x, y, z);
        if (this.blocks.has(key)) return; // already exists

        const geometry = new THREE.BoxGeometry(size, size, size/4);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        // this.scene.add(mesh);
        this.world.add(mesh);

        if(true) {
            const coordLbl = mesh.position.clone();
            coordLbl.z += size/2 + 0.125;
            const label = this.createTextLabel(`${coordLbl.x}, ${coordLbl.y}`, coordLbl, 14);
            this.world.add(label);
        }

        // Add a timer state to the block (increasing over time)
        this.blocks.set(key, { mesh, timer: 0 });
    }


    removeBlock(x, y, z) {
        const key = this._key(x, y, z);
        const block = this.blocks.get(key);
        if (block) {
            // this.scene.remove(block.mesh);
            this.world.remove(block.mesh);
            this.blocks.delete(key);
        }
    }

    clearAll() {
        // Remove all blocks from the scene
        for (let [key, block] of this.blocks) {
            // this.scene.remove(block.mesh);
            this.world.remove(block.mesh);
        }
        this.clearGroup(this.world);
        this.blocks.clear();
    }

    update() {
        // Loop through blocks and update their timers/material
        for (let [key, block] of this.blocks) {

            // Example: animate matrix (e.g., bobbing block)
            // const matrix = new THREE.Matrix4().makeTranslation(0, Math.sin(performance.now() / 500) * 0.1, 0);
            // block.mesh.updateMatrix();
            // block.mesh.geometry.applyMatrix4( matrix );

            block.timer += 0.01; // increment timer
            if (block.timer > 4) block.timer = 0; // reset after 2 seconds

            // Change block color based on timer
            const color = new THREE.Color(0x00ee00).lerp(new THREE.Color(0x00bb00), Math.sin(block.timer * Math.PI/2));
            block.mesh.material.color.set(color);
        }
    }

    createTextLabel(text, position, fontSize = 28) {
        // Create canvas to draw text
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

        // Create texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        // Create sprite
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
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

            // Dispose geometry
            if (child.geometry) {
                child.geometry.dispose();
            }

            // Dispose material (handle arrays too)
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }

            // Dispose texture if present
            if (child.material && child.material.map) {
                child.material.map.dispose();
            }

            group.remove(child);
        }
    }
}