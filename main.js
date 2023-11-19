import * as THREE from "three";

import Stats from "three/addons/libs/stats.module.js";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { Octree } from "three/addons/math/Octree.js";
import { OctreeHelper } from "three/addons/helpers/OctreeHelper.js";

import { Capsule } from "three/addons/math/Capsule.js";

import { GUI } from "three/addons/libs/lil-gui.module.min.js";

import { createNoise2D } from 'simplex-noise';

import * as dat from 'dat.gui';

// Dev GUI

const gui = new dat.GUI();
let settings = {
  area: 500,
  resolution: 150,
  octaves: 5,
  persistence: 0.5,
  scale: .1,
  noiseFrequency: 0.4,
  flattenThreshold: 0,
  flatnessStrength: 0,
  noiseFrequencyMultiplier: 2,
  noiseAmplitude: 1,
  noiseMaxVal: 0,
  regenerate: function () {
    scene.remove(landscape); // Remove the old landscape
    landscape = createLandscape(settings.area, settings.area, settings.resolution, (x, z) => noise2D(x, z));
    landscape.receiveShadow = true;
    scene.add(landscape);
  }
};

gui.add(settings, 'area', 100, 1000).step(1).onChange(settings.regenerate);
gui.add(settings, 'resolution', 10, 500).step(1).onChange(settings.regenerate);
gui.add(settings, 'octaves', 1, 8).step(1).onChange(settings.regenerate);
gui.add(settings, 'persistence', 0.1, 1).step(0.1).onChange(settings.regenerate);
gui.add(settings, 'scale', 0, .5).step(.001).onChange(settings.regenerate);
gui.add(settings, 'noiseFrequency', 0.1, 2).step(0.1).onChange(settings.regenerate);
gui.add(settings, 'flattenThreshold', 0, 1).step(0.01).onChange(settings.regenerate);
gui.add(settings, 'flatnessStrength', 0, 1).step(0.01).onChange(settings.regenerate);
gui.add(settings, 'regenerate');

const clock = new THREE.Clock();

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x88ccee);

//scene.fog = new THREE.Fog(0x88ccee, 0, 50);

// --- Camera --- //
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.rotation.order = "YXZ";

// --- Lights --- //

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
hemiLight.color.setHSL(0.6, 1, 0.6);
hemiLight.groundColor.setHSL(0.095, 1, 0.75);
hemiLight.position.set(0, 100, 0);
scene.add(hemiLight);

const hemiLightHelper = new THREE.HemisphereLightHelper(hemiLight, 10);
scene.add(hemiLightHelper);

const dirLight = new THREE.DirectionalLight(0xffffff, 3);
dirLight.color.setHSL(0.1, 1, 0.95);
dirLight.position.set(- 1, 200, -200);
scene.add(dirLight);

dirLight.castShadow = true;

dirLight.shadow.mapSize.width = 5048;
dirLight.shadow.mapSize.height = 5048;

const d = 250;

dirLight.shadow.camera.left = - d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = - d;

dirLight.shadow.camera.near = 100;
dirLight.shadow.camera.far = 3500;
dirLight.shadow.bias = - 0.0001;
dirLight.shadow.radius = 4;

const dirLightHelper = new THREE.DirectionalLightHelper(dirLight, 10);
scene.add(dirLightHelper);


// --- Renderer --- //

const container = document.getElementById("container");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const stats = new Stats();
stats.domElement.style.position = "absolute";
stats.domElement.style.top = "0px";
container.appendChild(stats.domElement);

// --- Physics/game constants --- //

const GRAVITY = 30;

const NUM_SPHERES = 100;
const SPHERE_RADIUS = 0.2;

const STEPS_PER_FRAME = 5;

// --- Spheres --- //

const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
let sphereIdx = 0;

for (let i = 0; i < NUM_SPHERES; i++) {
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  sphere.castShadow = true;
  sphere.receiveShadow = true;

  scene.add(sphere);

  spheres.push({
    mesh: sphere,
    collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), SPHERE_RADIUS),
    velocity: new THREE.Vector3(),
  });
}

// --- Collisions --- //

const worldOctree = new Octree();

const playerCollider = new Capsule(
  new THREE.Vector3(0, 0.35, 0),
  new THREE.Vector3(0, 1, 0),
  0.35
);

// --- Player --- //

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
let mouseTime = 0;

const keyStates = {};

const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

let devMode = false;

document.addEventListener('keydown', (event) => {
  if (event.code === 'KeyP') { // Press 'P' to toggle dev mode
    devMode = !devMode;
    playerVelocity.set(0, 0, 0); // Reset velocity when toggling dev mode
    console.log(`Dev Mode: ${devMode}`);
  }
  keyStates[event.code] = true;
});

document.addEventListener("keyup", (event) => {
  keyStates[event.code] = false;
});

container.addEventListener("mousedown", () => {
  document.body.requestPointerLock();

  mouseTime = performance.now();
});

document.addEventListener("mouseup", () => {
  if (document.pointerLockElement !== null) throwBall();
});

document.body.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === document.body) {
    camera.rotation.y -= event.movementX / 500;
    camera.rotation.x -= event.movementY / 500;
  }
});

window.addEventListener("resize", onWindowResize);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function throwBall() {
  const sphere = spheres[sphereIdx];

  camera.getWorldDirection(playerDirection);

  sphere.collider.center
    .copy(playerCollider.end)
    .addScaledVector(playerDirection, playerCollider.radius * 1.5);

  // throw the ball with more force if we hold the button longer, and if we move forward

  const impulse =
    15 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

  sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
  sphere.velocity.addScaledVector(playerVelocity, 2);

  sphereIdx = (sphereIdx + 1) % spheres.length;
}

function playerCollisions() {
  const result = worldOctree.capsuleIntersect(playerCollider);

  playerOnFloor = false;

  if (result) {
    playerOnFloor = result.normal.y > 0;

    if (!playerOnFloor) {
      playerVelocity.addScaledVector(
        result.normal,
        -result.normal.dot(playerVelocity)
      );
    }

    playerCollider.translate(result.normal.multiplyScalar(result.depth));
  }
}

function updatePlayer(deltaTime) {
  if (!devMode) {
    let damping = Math.exp(-4 * deltaTime) - 1;

    if (!playerOnFloor) {
      playerVelocity.y -= GRAVITY * deltaTime;

      // small air resistance
      damping *= 0.1;
    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();

    camera.position.copy(playerCollider.end);
  }
  // If in devmode, m
}

function playerSphereCollision(sphere) {
  const center = vector1
    .addVectors(playerCollider.start, playerCollider.end)
    .multiplyScalar(0.5);

  const sphere_center = sphere.collider.center;

  const r = playerCollider.radius + sphere.collider.radius;
  const r2 = r * r;

  // approximation: player = 3 spheres

  for (const point of [playerCollider.start, playerCollider.end, center]) {
    const d2 = point.distanceToSquared(sphere_center);

    if (d2 < r2) {
      const normal = vector1.subVectors(point, sphere_center).normalize();
      const v1 = vector2
        .copy(normal)
        .multiplyScalar(normal.dot(playerVelocity));
      const v2 = vector3
        .copy(normal)
        .multiplyScalar(normal.dot(sphere.velocity));

      playerVelocity.add(v2).sub(v1);
      sphere.velocity.add(v1).sub(v2);

      const d = (r - Math.sqrt(d2)) / 2;
      sphere_center.addScaledVector(normal, -d);
    }
  }
}

function spheresCollisions() {
  for (let i = 0, length = spheres.length; i < length; i++) {
    const s1 = spheres[i];

    for (let j = i + 1; j < length; j++) {
      const s2 = spheres[j];

      const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
      const r = s1.collider.radius + s2.collider.radius;
      const r2 = r * r;

      if (d2 < r2) {
        const normal = vector1
          .subVectors(s1.collider.center, s2.collider.center)
          .normalize();
        const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
        const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

        s1.velocity.add(v2).sub(v1);
        s2.velocity.add(v1).sub(v2);

        const d = (r - Math.sqrt(d2)) / 2;

        s1.collider.center.addScaledVector(normal, d);
        s2.collider.center.addScaledVector(normal, -d);
      }
    }
  }
}

function updateSpheres(deltaTime) {
  spheres.forEach((sphere) => {
    sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);

    const result = worldOctree.sphereIntersect(sphere.collider);

    if (result) {
      sphere.velocity.addScaledVector(
        result.normal,
        -result.normal.dot(sphere.velocity) * 1.5
      );
      sphere.collider.center.add(result.normal.multiplyScalar(result.depth));
    } else {
      sphere.velocity.y -= GRAVITY * deltaTime;
    }

    const damping = Math.exp(-1.5 * deltaTime) - 1;
    sphere.velocity.addScaledVector(sphere.velocity, damping);

    playerSphereCollision(sphere);
  });

  spheresCollisions();

  for (const sphere of spheres) {
    sphere.mesh.position.copy(sphere.collider.center);
  }
}

function getForwardVector() {
  camera.getWorldDirection(playerDirection);
  playerDirection.y = 0;
  playerDirection.normalize();

  return playerDirection;
}

function getSideVector() {
  camera.getWorldDirection(playerDirection);
  playerDirection.y = 0;
  playerDirection.normalize();
  playerDirection.cross(camera.up);

  return playerDirection;
}

// --- Controls --- //

function controls(deltaTime) {

  if (devMode) {
    // In dev mode, allow flying by controlling movement in all directions
    const speedDelta = deltaTime * 25;
    if (keyStates["KeyW"]) {
      camera.translateZ(-speedDelta);
    }
    if (keyStates["KeyS"]) {
      camera.translateZ(speedDelta);
    }
    if (keyStates["KeyA"]) {
      camera.translateX(-speedDelta);
    }
    if (keyStates["KeyD"]) {
      camera.translateX(speedDelta);
    }
    if (keyStates["Space"]) {
      camera.translateY(speedDelta);
    }
    if (keyStates["ShiftLeft"]) {
      camera.translateY(-speedDelta);
    }
  } else {
    // gives a bit of air control
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates["KeyW"]) {
      playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));
    }

    if (keyStates["KeyS"]) {
      playerVelocity.add(getForwardVector().multiplyScalar(-speedDelta));
    }

    if (keyStates["KeyA"]) {
      playerVelocity.add(getSideVector().multiplyScalar(-speedDelta));
    }

    if (keyStates["KeyD"]) {
      playerVelocity.add(getSideVector().multiplyScalar(speedDelta));
    }

    if (playerOnFloor) {
      if (keyStates["Space"]) {
        playerVelocity.y = 15;
      }
    }
  }
}

// --- Out of bounds helper --- //

function teleportPlayerIfOob() {
  if (camera.position.y <= -25) {
    playerCollider.start.set(0, 0.35, 0);
    playerCollider.end.set(0, 1, 0);
    playerCollider.radius = 0.35;
    camera.position.copy(playerCollider.end);
    camera.rotation.set(0, 0, 0);
  }
}

// --- Main loop --- //

function animate() {
  const deltaTime = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME;

  // we look for collisions in substeps to mitigate the risk of
  // an object traversing another too quickly for detection.

  for (let i = 0; i < STEPS_PER_FRAME; i++) {
    controls(deltaTime);

    updatePlayer(deltaTime);

    updateSpheres(deltaTime);

    teleportPlayerIfOob();
  }

  renderer.render(scene, camera);

  stats.update();

  requestAnimationFrame(animate);
}

// --- Landscape generation --- //

function layeredNoise(x, z, noiseFn, octaves = 4, persistence = 0.5) {
  let total = 0;
  let frequency = settings.noiseFrequency; // 1
  let amplitude = settings.noiseAmplitude; // 1
  let maxValue = settings.noiseMaxVal; // 0 // Used for normalizing result to [-1, 1]

  for (let i = 0; i < octaves; i++) {
    total += noiseFn(x * frequency, z * frequency) * amplitude;

    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= settings.noiseFrequencyMultiplier; // 2
  }

  return total / maxValue;
}

function remapNoiseValue(noiseValue, flattenThreshold = 0.3, flatnessStrength = 0.5) {
  if (noiseValue < flattenThreshold) {
    return flattenThreshold + (noiseValue - flattenThreshold) * flatnessStrength;
  } else {
    return noiseValue;
  }
}

function createLandscape(width, depth, resolution, noiseFn) {
  const geometry = new THREE.PlaneGeometry(width, depth, resolution, resolution);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);

    let noiseValue = layeredNoise(x / (settings.area / 10), z / (settings.area / 10), noiseFn, settings.octaves, settings.persistence);

    noiseValue = remapNoiseValue(noiseValue, settings.flattenThreshold, settings.flatnessStrength);

    const height = noiseValue * (settings.area * settings.scale);

    position.setY(i, height);
    position.needsUpdate = true;
  }

  geometry.computeVertexNormals(); // This is important for a low poly look

  const material = new THREE.MeshLambertMaterial({ color: 0x00ff00, flatShading: true });
  return new THREE.Mesh(geometry, material);
}

const noise2D = createNoise2D();

let landscape = createLandscape(settings.area, settings.area, settings.resolution, (x, z) => noise2D(x, z));
landscape.receiveShadow = true;
scene.add(landscape);
worldOctree.fromGraphNode(landscape);

// --- Run main loop --- //

animate();