// 3D Engine for WRACKLINE - Stylized Low-Poly 3D Art Architecture
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Loot3DItem {
  id: number;
  val: number;
  baseVal: number;
  band: 'near' | 'mid' | 'far';
  type: number;
  x: number;
  y: number;
  z: number;
  origX: number;
  mesh: THREE.Group;
  isAttached: boolean;
  attachAngle: number;
  attachElev: number;
  sparkleGroup?: THREE.Group;
}

// Procedural Atmospheric Sky Gradient for Low-Poly Horizon
function createLowPolySkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0.0, '#1B5B88');  // Deep cobalt zenith
  grad.addColorStop(0.35, '#357CA8'); // Soft coastal azure
  grad.addColorStop(0.68, '#6BB2DA'); // Cerulean
  grad.addColorStop(0.85, '#BCE0F5'); // Low-poly horizon mist
  grad.addColorStop(0.94, '#FBE4C6'); // Warm sand sunset haze
  grad.addColorStop(1.0, '#E6CFB4');  // Low-poly ground blend

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 1024);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Low-Poly Octagonal Contact Shadow Texture
function createLowPolyShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 128);

  // Polygonal faceted shadow
  ctx.fillStyle = 'rgba(24, 18, 14, 0.45)';
  ctx.beginPath();
  const sides = 8;
  const r = 52;
  for (let i = 0; i < sides; i++) {
    const a = (i * Math.PI * 2) / sides;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r * 0.75;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------------------
// Shared terrain sampler.
// Props sample this so they bed into the sand they are actually standing on
// rather than floating above it or sinking through it. It must mirror
// buildLowPolyTerrain() exactly: the dune mesh is offset by (6, -0.6, 0).
// ---------------------------------------------------------------------------
export const DUNE_OFFSET_X = 6;
export const DUNE_OFFSET_Y = -0.6;

export function duneHeight(x: number, z: number): number {
  const lx = x - DUNE_OFFSET_X;
  const duneSlope = -lx * 0.11;
  const bigMounds = Math.sin(lx * 0.22 + z * 0.14) * 0.72 + Math.cos(z * 0.24) * 0.48;
  const terrace = Math.floor((duneSlope + bigMounds) * 2.2) * 0.12;
  return DUNE_OFFSET_Y + duneSlope + bigMounds + terrace;
}

// Wet shoreline strip. Mirrors the wetSandMesh placed at (22, -2.15, 0).
export function shoreHeight(x: number, z: number): number {
  const lx = x - 22;
  return -2.15 + -lx * 0.11 + Math.sin(lx * 0.35 + z * 0.2) * 0.2;
}

// Ground under a prop: whichever of the two overlapping surfaces is on top.
export function groundHeightAt(x: number, z: number): number {
  return Math.max(duneHeight(x, z), shoreHeight(x, z));
}

// ---------------------------------------------------------------------------
// Camera framing maths, kept pure so the portrait framing can be reasoned about
// (and measured) without a canvas.
//
// A tall, narrow frame has a narrow horizontal field of view, so a camera that
// simply aims at the scuttler pins it to dead centre: the shore slides past but
// the character itself never appears to move. The portrait aim therefore sits a
// bounded distance BEHIND the direction of travel, which makes the scuttler
// visibly lunge to that side while it scuttles and settle back to centre when
// the player lets go. Bounding the lead as a share of the frame's half-width is
// what stops that swing from ever reaching the edge of a phone screen.
// ---------------------------------------------------------------------------
export function frameHalfWidth(camZ: number, fovDeg: number, aspect: number): number {
  return Math.abs(camZ) * Math.tan((fovDeg * Math.PI) / 360) * aspect;
}

export const PORTRAIT_LEAD_TIME = 0.2; // seconds of travel the aim trails behind

export function portraitAimX(
  playerX3D: number,
  playerSpeed: number,
  halfFrameWidth: number
): number {
  const maxLead = halfFrameWidth * 0.4;
  const lead = Math.max(-maxLead, Math.min(maxLead, playerSpeed * PORTRAIT_LEAD_TIME));
  return playerX3D - lead;
}

// ---------------------------------------------------------------------------
// Breaker geometry, expressed in the wave group's own local frame. Local +X
// points out to sea and local X = 0 is the leading toe of the wave. Every
// surface is rebuilt each frame (see update()) so the surge can be draped onto
// whatever beach it happens to be crossing.
// ---------------------------------------------------------------------------
export const SEA_SURFACE_Y = -2.2; // matches the sea mesh position
const WAVE_HEIGHT = 1.55;
const WAVE_PEAK_X = 2.0;
const WAVE_DEPTH = 40; // long-shore span of the breaker
const WAVE_SWELL_X0 = -6; // toe of the face
const WAVE_SWELL_X1 = 22; // tail, out in the open sea
const WAVE_LIP_X0 = -2.2; // whitewater over the upper face and crest
const WAVE_LIP_X1 = 3.4;
const WAVE_SHEET_X0 = -4; // inland end, buried under the sand
const WAVE_SHEET_X1 = 8; // seaward end, hidden under the swell body

// The surface a wave has to sit on: the sand it is running over, or sea level
// wherever the beach has already dropped below the waterline. Draping the
// breaker on this is what keeps it attached to the rest of the sea instead of
// leaving it standing on dry sand with a gap behind it.
export function waterSurfaceY(x: number, z: number): number {
  return Math.max(groundHeightAt(x, z) + 0.07, SEA_SURFACE_Y);
}

// Asymmetric shoaling profile: a short steep face shoreward of the crest, then a
// long swell easing back down to the open sea behind it.
function waveProfile(lx: number, peak: number, height: number): number {
  if (lx <= peak) {
    const t = Math.max(0, Math.min(1, (lx - WAVE_SWELL_X0) / (peak - WAVE_SWELL_X0)));
    return height * Math.pow(Math.sin(t * Math.PI * 0.5), 0.8);
  }
  const t = Math.max(0, Math.min(1, (lx - peak) / (WAVE_SWELL_X1 - peak)));
  return height * Math.pow(1 - t, 1.8);
}

export class Wrackline3D {
  container: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  isDisposed = false;

  // Camera tracking
  baseCameraPos = new THREE.Vector3(0, 8.2, 15.5);
  baseCameraTarget = new THREE.Vector3(2.5, 0.5, 0);
  currentCamX = 0;
  shakeIntensity = 0;

  // Greed made visible. The scuttler swells as it holds more unbanked wrack; the
  // hitbox in App.tsx reads this, so a swollen shell really is a wider target.
  blobGrowScale = 1;

  // 0 on a wide screen, 1 once the frame is comfortably taller than it is wide.
  // Drives every portrait camera adjustment: field of view, camera height and
  // distance, follow rate, and how far the aim leads the scuttler.
  portraitness = 0;

  // Smoothed scuttling speed (world units per second), used to lead the portrait
  // camera so the character visibly lunges in the direction it is travelling.
  playerSpeed = 0;
  lastPlayerX = 0;

  // Low-Poly Terrain & Ocean
  duneMesh!: THREE.Mesh;
  wetSandMesh!: THREE.Mesh;
  seaMesh!: THREE.Mesh;
  seaGeoNonIndexed!: THREE.BufferGeometry;
  seaInitialPositions!: Float32Array;
  oceanTime = 0;

  // Low-Poly Scenery Groups
  treeGroup!: THREE.Group;
  rockGroup!: THREE.Group;
  grassGroup!: THREE.Group;
  wrackGroup!: THREE.Group;
  sunCorona!: THREE.Mesh;
  sunCoronaMat!: THREE.MeshBasicMaterial;

  // Living-scenery registries
  wrackItems: { mesh: THREE.Object3D; x: number; z: number; lift: number }[] = [];
  swayTrees: THREE.Object3D[] = [];
  swayGrass: THREE.Object3D[] = [];
  cloudDrift: THREE.Object3D[] = [];
  cloudsGroup!: THREE.Group;
  sunGroup!: THREE.Group;
  skyDome!: THREE.Mesh;

  // Low-Poly Wave Breaker Surge (swell body, breaking lip, water sheet, whitewater)
  waveGroup: THREE.Group;
  waveSwellMesh!: THREE.Mesh;
  waveSwellGeo!: THREE.BufferGeometry;
  swellInitialPositions!: Float32Array;
  waveLipMesh!: THREE.Mesh;
  waveLipGeo!: THREE.BufferGeometry;
  lipInitialPositions!: Float32Array;
  waveSheetMesh!: THREE.Mesh;
  waveSheetGeo!: THREE.BufferGeometry;
  sheetInitialPositions!: Float32Array;

  // Low-Poly Hero Scavenger Creature (Faceted Hermit Scuttler)
  blobGroup: THREE.Group;
  blobShell!: THREE.Mesh;
  blobUnderbelly!: THREE.Mesh;
  blobShadow!: THREE.Mesh;
  eyeLeftGroup!: THREE.Group;
  eyeRightGroup!: THREE.Group;
  clawLeft!: THREE.Mesh;
  clawRight!: THREE.Mesh;
  playerLegs: THREE.Mesh[] = [];

  // Low-Poly Particles (Cubes, Tetrahedrons & Octahedrons)
  sprayParticles: {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
    life: number;
    maxLife: number;
  }[] = [];
  dustParticles: {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
  }[] = [];
  haulParticles: {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
  }[] = [];

  // Low-Poly Particle Geometries
  polyCubeGeo: THREE.BoxGeometry;
  polyTetraGeo: THREE.TetrahedronGeometry;
  polyOctaGeo: THREE.OctahedronGeometry;

  // Shared Low-Poly Materials
  sandMat: THREE.MeshStandardMaterial;
  wetSandMat: THREE.MeshStandardMaterial;
  seaMat: THREE.MeshStandardMaterial;
  waveSwellMat: THREE.MeshStandardMaterial;
  waveFoamMat: THREE.MeshStandardMaterial;
  waveSheetMat: THREE.MeshStandardMaterial;
  woodMat: THREE.MeshStandardMaterial;
  driftwoodMat: THREE.MeshStandardMaterial;
  kelpMat: THREE.MeshStandardMaterial;
  kelpBulbMat: THREE.MeshStandardMaterial;
  shellMat: THREE.MeshStandardMaterial;
  crabMat: THREE.MeshStandardMaterial;
  leafMat: THREE.MeshStandardMaterial;
  rockMat: THREE.MeshStandardMaterial;
  goldMat: THREE.MeshStandardMaterial;
  gemMat: THREE.MeshPhysicalMaterial;

  constructor(container: HTMLElement) {
    this.container = container;

    // 1. Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xBDE0F5);
    // Lighter haze than the old 0.009: that density greyed the whole shore out,
    // so the beach went pale and featureless as the player walked up it.
    this.scene.fog = new THREE.FogExp2(0xC6E2F4, 0.0048);

    // 2. Camera Setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.5, 350);
    this.applyFramingForAspect(aspect);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.baseCameraTarget);

    // 3. Renderer with Crisp Low-Poly Shadows
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed in this version of three, and asking for it
    // only logged a warning while falling back to PCFShadowMap anyway.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    container.appendChild(this.renderer.domElement);

    // 4. Low-Poly Environment Light
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const envRoom = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(envRoom, 0.04).texture;
    pmremGenerator.dispose();

    // 5. Shared Low-Poly Flat-Shaded Materials
    this.sandMat = new THREE.MeshStandardMaterial({
      color: 0xDEC28C, // Warm faceted golden sand
      roughness: 0.88,
      metalness: 0.04,
      flatShading: true
    });

    this.wetSandMat = new THREE.MeshStandardMaterial({
      color: 0x9E7848, // Glistening faceted wet sand
      roughness: 0.22,
      metalness: 0.28,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    this.seaMat = new THREE.MeshStandardMaterial({
      color: 0x1A85B6, // Vibrant low-poly sea
      roughness: 0.16,
      metalness: 0.18,
      flatShading: true,
      transparent: true,
      opacity: 0.94
    });

    // Body water: opaque, so it always covers the shallow sheet it sits in.
    this.waveSwellMat = new THREE.MeshStandardMaterial({
      color: 0x1A85B6, // same family as the sea, so the surge reads as the sea
      roughness: 0.18,
      metalness: 0.16,
      flatShading: true
    });

    this.waveFoamMat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.35,
      metalness: 0.05,
      flatShading: true
    });

    // Shallow water sheeting up the beach: transparent, and offset toward the
    // camera so the sand underneath can never poke through it.
    this.waveSheetMat = new THREE.MeshStandardMaterial({
      color: 0x36A2D0,
      roughness: 0.2,
      metalness: 0.14,
      flatShading: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });

    this.woodMat = new THREE.MeshStandardMaterial({
      color: 0xA68552,
      roughness: 0.82,
      metalness: 0.04,
      flatShading: true
    });

    // Bleached driftwood is greyer than living wood; kelp is olive-brown when it
    // has dried on the sand.
    this.driftwoodMat = new THREE.MeshStandardMaterial({
      color: 0xBFAE93,
      roughness: 0.9,
      metalness: 0.03,
      flatShading: true
    });

    this.kelpMat = new THREE.MeshStandardMaterial({
      color: 0x51603A,
      roughness: 0.72,
      metalness: 0.05,
      flatShading: true
    });

    this.kelpBulbMat = new THREE.MeshStandardMaterial({
      color: 0x74803F,
      roughness: 0.6,
      metalness: 0.04,
      flatShading: true
    });

    this.shellMat = new THREE.MeshStandardMaterial({
      color: 0xF2E6D2,
      roughness: 0.45,
      metalness: 0.06,
      flatShading: true
    });

    this.crabMat = new THREE.MeshStandardMaterial({
      color: 0xB65C42,
      roughness: 0.5,
      metalness: 0.06,
      flatShading: true
    });

    this.leafMat = new THREE.MeshStandardMaterial({
      color: 0x3F7E50, // Low-poly coastal pine green
      roughness: 0.8,
      metalness: 0.05,
      flatShading: true
    });

    this.rockMat = new THREE.MeshStandardMaterial({
      color: 0x767E88, // Low-poly faceted rock gray
      roughness: 0.85,
      metalness: 0.08,
      flatShading: true
    });

    this.goldMat = new THREE.MeshStandardMaterial({
      color: 0xF8C63E,
      roughness: 0.25,
      metalness: 0.92,
      flatShading: true
    });

    this.gemMat = new THREE.MeshPhysicalMaterial({
      color: 0x38B2AC,
      roughness: 0.1,
      metalness: 0.08,
      transmission: 0.88,
      ior: 1.52,
      transparent: true,
      opacity: 0.92,
      flatShading: true
    });

    // Low-Poly Particle Geometries
    this.polyCubeGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
    this.polyTetraGeo = new THREE.TetrahedronGeometry(0.16, 0);
    this.polyOctaGeo = new THREE.OctahedronGeometry(0.18, 0);

    // 6. Directional Sunlight Rig for Faceted Polygon Shading
    const hemiLight = new THREE.HemisphereLight(0x86BBE4, 0xD4B886, 0.75);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xFFF0D0, 1.6);
    sunLight.position.set(-22, 34, 26);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 120;
    sunLight.shadow.camera.left = -34;
    sunLight.shadow.camera.right = 46;
    sunLight.shadow.camera.top = 30;
    sunLight.shadow.camera.bottom = -30;
    sunLight.shadow.bias = -0.0004;
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x76C6F5, 0.7);
    rimLight.position.set(38, 16, -18);
    this.scene.add(rimLight);

    // 7. Skydome
    const skyGeo = new THREE.SphereGeometry(260, 24, 18);
    const skyMat = new THREE.MeshBasicMaterial({
      map: createLowPolySkyTexture(),
      side: THREE.BackSide,
      fog: false
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.position.set(0, -20, 0);
    this.scene.add(this.skyDome);

    // 8. Low-Poly Sky Props (Faceted Sun & Low-Poly Clouds)
    this.sunGroup = new THREE.Group();
    this.cloudsGroup = new THREE.Group();
    this.buildLowPolySky();
    this.scene.add(this.sunGroup);
    this.scene.add(this.cloudsGroup);

    // 9. Low-Poly Dunes Terrain (Non-indexed faceted mesh)
    this.buildLowPolyTerrain();

    // 10. Low-Poly Animated Ocean Mesh
    this.buildLowPolyOcean();

    // 11. Low-Poly Scenery Props (Pine Trees, Boulders, Driftwood, Grass)
    this.treeGroup = new THREE.Group();
    this.rockGroup = new THREE.Group();
    this.grassGroup = new THREE.Group();
    this.wrackGroup = new THREE.Group();
    this.buildLowPolyScenery();
    this.buildBeachDetail();
    this.scene.add(this.treeGroup);
    this.scene.add(this.rockGroup);
    this.scene.add(this.grassGroup);
    this.scene.add(this.wrackGroup);

    // 12. Low-Poly Tidal Breaker Wave
    this.waveGroup = new THREE.Group();
    this.buildLowPolyWave();
    this.waveGroup.position.set(50, 0, 0);
    this.scene.add(this.waveGroup);

    // 13. Low-Poly Hero Scavenger Creature (Hermit Scuttler)
    this.blobGroup = new THREE.Group();
    this.buildLowPolyCharacter();
    this.scene.add(this.blobGroup);

    window.addEventListener('resize', this.onResize);
  }

  // 1. Build Faceted Low-Poly Sand Dunes
  buildLowPolyTerrain() {
    // Dunes Plane with faceted triangulation
    const duneGeoRaw = new THREE.PlaneGeometry(120, 80, 42, 30);
    duneGeoRaw.rotateX(-Math.PI / 2);

    const pos = duneGeoRaw.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Downward slope towards the ocean
      const duneSlope = -x * 0.11;
      // Polygonal undulating dune mounds
      const bigMounds = Math.sin(x * 0.22 + z * 0.14) * 0.72 + Math.cos(z * 0.24) * 0.48;
      // Low-poly terracing steps
      const terrace = Math.floor((duneSlope + bigMounds) * 2.2) * 0.12;

      pos.setY(i, duneSlope + bigMounds + terrace);
    }

    // Convert to non-indexed so each triangle has unique vertices and facet normals!
    const nonIndexedDunes = duneGeoRaw.toNonIndexed();
    nonIndexedDunes.computeVertexNormals();

    this.duneMesh = new THREE.Mesh(nonIndexedDunes, this.sandMat);
    this.duneMesh.position.set(6, -0.6, 0);
    this.duneMesh.receiveShadow = true;
    this.scene.add(this.duneMesh);

    // Shoreline wet sand strip
    const wetGeoRaw = new THREE.PlaneGeometry(36, 80, 20, 24);
    wetGeoRaw.rotateX(-Math.PI / 2);
    const wpos = wetGeoRaw.attributes.position;
    for (let i = 0; i < wpos.count; i++) {
      const x = wpos.getX(i);
      const z = wpos.getZ(i);
      const slope = -x * 0.11;
      const ripple = Math.sin(x * 0.35 + z * 0.2) * 0.2;
      wpos.setY(i, slope + ripple);
    }
    const nonIndexedWet = wetGeoRaw.toNonIndexed();
    nonIndexedWet.computeVertexNormals();

    this.wetSandMesh = new THREE.Mesh(nonIndexedWet, this.wetSandMat);
    this.wetSandMesh.position.set(22, -2.15, 0);
    this.wetSandMesh.receiveShadow = true;
    this.scene.add(this.wetSandMesh);
  }

  // 2. Build Low-Poly Animated Ocean
  buildLowPolyOcean() {
    const seaGeoRaw = new THREE.PlaneGeometry(92, 105, 34, 34);
    seaGeoRaw.rotateX(-Math.PI / 2);

    this.seaGeoNonIndexed = seaGeoRaw.toNonIndexed();
    this.seaInitialPositions = new Float32Array(
      this.seaGeoNonIndexed.attributes.position.array
    );

    this.seaMesh = new THREE.Mesh(this.seaGeoNonIndexed, this.seaMat);
    this.seaMesh.position.set(45, -2.2, 0);
    this.seaMesh.receiveShadow = true;
    this.scene.add(this.seaMesh);
  }

  // 3. Build Low-Poly Sky: Faceted Sun & Puffy Block Clouds
  buildLowPolySky() {
    // Faceted Icosahedron Sun
    const sunGeo = new THREE.IcosahedronGeometry(4.2, 1);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xFFFBE8, fog: false });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(44, 26, -42);
    this.sunGroup.add(sunMesh);

    // Polygonal Sun Rays Corona
    const coronaGeo = new THREE.RingGeometry(4.6, 8.4, 12);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xFDE68A,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      fog: false
    });
    const corona = new THREE.Mesh(coronaGeo, coronaMat);
    corona.position.set(44, 26, -41.5);
    corona.lookAt(this.baseCameraPos);
    this.sunGroup.add(corona);
    this.sunCorona = corona;
    this.sunCoronaMat = coronaMat;

    // Stylized Low-Poly Clouds (Clusters of faceted boxes and dodecahedrons)
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xFDFBF7,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true
    });

    const cloudConfigs = [
      { x: -20, y: 25, z: -38, s: 2.2 },
      { x: 12, y: 28, z: -46, s: 2.8 },
      { x: 38, y: 23, z: -34, s: 2.0 }
    ];

    for (const cfg of cloudConfigs) {
      const cGroup = new THREE.Group();
      cGroup.position.set(cfg.x, cfg.y, cfg.z);
      const s = cfg.s;

      const p1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 * s, 0), cloudMat);
      const p2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8 * s, 0), cloudMat);
      p2.position.set(1.4 * s, 0.3 * s, 0);
      const p3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 * s, 0), cloudMat);
      p3.position.set(2.8 * s, -0.2 * s, 0);
      const p4 = new THREE.Mesh(new THREE.BoxGeometry(1.5 * s, 1.0 * s, 1.2 * s), cloudMat);
      p4.position.set(0.8 * s, -0.4 * s, 0);

      cGroup.add(p1);
      cGroup.add(p2);
      cGroup.add(p3);
      cGroup.add(p4);
      this.cloudsGroup.add(cGroup);
      this.cloudDrift.push(cGroup);
    }
  }

  // 4. Build Low-Poly Scenery: Coastal Pines, Boulders, Grass & Driftwood
  buildLowPolyScenery() {
    // 4.1 Low-Poly Coastal Pines (Inland dunes)
    for (let i = 0; i < 18; i++) {
      const tree = new THREE.Group();
      const x = -5 - Math.random() * 21;
      const z = (Math.random() - 0.5) * 48;
      const groundY = duneHeight(x, z) - 0.06;
      tree.position.set(x, groundY, z);

      // Faceted trunk (hexagonal cylinder)
      const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 1.8, 6);
      const trunk = new THREE.Mesh(trunkGeo, this.woodMat);
      trunk.position.y = 0.9;
      trunk.castShadow = true;
      tree.add(trunk);

      // 3 Stacked Faceted Cones (5-sided pentagonal pyramids)
      const c1Geo = new THREE.ConeGeometry(1.4, 1.5, 5);
      const c1 = new THREE.Mesh(c1Geo, this.leafMat);
      c1.position.y = 1.8;
      c1.castShadow = true;
      tree.add(c1);

      const c2Geo = new THREE.ConeGeometry(1.05, 1.3, 5);
      const c2 = new THREE.Mesh(c2Geo, this.leafMat);
      c2.position.y = 2.6;
      c2.castShadow = true;
      tree.add(c2);

      const c3Geo = new THREE.ConeGeometry(0.7, 1.1, 5);
      const c3 = new THREE.Mesh(c3Geo, this.leafMat);
      c3.position.y = 3.3;
      c3.castShadow = true;
      tree.add(c3);

      const scale = 0.85 + Math.random() * 0.45;
      tree.scale.set(scale, scale, scale);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.treeGroup.add(tree);
      this.swayTrees.push(tree);
    }

    // 4.2 Low-Poly Granite Boulders
    for (let i = 0; i < 16; i++) {
      const x = -8 + (Math.random() - 0.5) * 28;
      const z = (Math.random() - 0.5) * 44;
      const r = 0.5 + Math.random() * 0.9;

      // Mixed faceting so no two boulders read as the same stamped shape.
      const rockGeo =
        Math.random() < 0.5
          ? new THREE.DodecahedronGeometry(r, 0)
          : new THREE.IcosahedronGeometry(r * 0.94, 0);
      const rock = new THREE.Mesh(rockGeo, this.rockMat);
      // Sit on the sand and sink slightly, so boulders read as embedded.
      rock.position.set(x, groundHeightAt(x, z) - r * 0.24, z);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.scale.set(1 + (Math.random() - 0.5) * 0.4, 0.75, 1 + (Math.random() - 0.5) * 0.4);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.rockGroup.add(rock);
    }

    // 4.3 Low-Poly Dune Grass (Sharp triangular polygon blades)
    for (let i = 0; i < 28; i++) {
      const clump = new THREE.Group();
      const x = -10 - Math.random() * 16;
      const z = (Math.random() - 0.5) * 44;
      clump.position.set(x, groundHeightAt(x, z), z);

      for (let b = 0; b < 4; b++) {
        const bladeGeo = new THREE.ConeGeometry(0.09, 1.2 + Math.random() * 0.6, 3);
        bladeGeo.translate(0, 0.6, 0);
        const blade = new THREE.Mesh(bladeGeo, this.leafMat);
        blade.rotation.x = (Math.random() - 0.5) * 0.4;
        blade.rotation.z = 0.25 + (Math.random() - 0.5) * 0.4;
        clump.add(blade);
      }
      this.grassGroup.add(clump);
      this.swayGrass.push(clump);
    }

    // 4.4 Low-Poly Wrack Line Flotsam (kelp, branched driftwood, shells, stone)
    for (let i = 0; i < 26; i++) {
      const z = (Math.random() - 0.5) * 44;
      const x = (Math.random() - 0.5) * 2.8;
      const piece = this.createWrackPiece();
      piece.position.set(x, 0.16, z);
      this.wrackItems.push({ mesh: piece, x, z, lift: 0.02 + Math.random() * 0.05 });
      this.wrackGroup.add(piece);
    }
  }

  // 4.4b A single piece of natural shore wrack. Everything the tide leaves behind
  //      is a tangle, a branch, a shell or a stone — never a stamped cylinder.
  createWrackPiece(): THREE.Object3D {
    const piece = new THREE.Group();
    const roll = Math.random();

    if (roll < 0.32) {
      // Tangle of kelp: a short stipe with flattened blades off it.
      const stipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 5), this.kelpMat);
      stipe.rotation.z = Math.PI / 2;
      piece.add(stipe);

      const blades = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < blades; b++) {
        const len = 0.7 + Math.random() * 1.2;
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(len, 0.05, 0.2 + Math.random() * 0.16),
          this.kelpMat
        );
        blade.position.set((Math.random() - 0.5) * 0.5, 0.03, (Math.random() - 0.5) * 0.4);
        blade.rotation.set(
          (Math.random() - 0.5) * 0.25,
          Math.random() * Math.PI,
          (Math.random() - 0.5) * 0.5
        );
        piece.add(blade);
      }

      if (Math.random() < 0.6) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), this.kelpBulbMat);
        bulb.position.set((Math.random() - 0.5) * 0.6, 0.08, (Math.random() - 0.5) * 0.4);
        piece.add(bulb);
      }
    } else if (roll < 0.6) {
      // Branched driftwood: a bleached trunk with one or two stubs left on it.
      const len = 0.9 + Math.random() * 1.6;
      const rad = 0.09 + Math.random() * 0.08;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(rad * 0.75, rad, len, 6),
        this.driftwoodMat
      );
      trunk.rotation.z = Math.PI / 2;
      piece.add(trunk);

      const branches = 1 + Math.floor(Math.random() * 2);
      for (let b = 0; b < branches; b++) {
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(rad * 0.35, rad * 0.62, len * 0.5, 5),
          this.driftwoodMat
        );
        branch.position.set((Math.random() - 0.5) * len * 0.7, rad * 0.85, 0);
        branch.rotation.set(
          Math.PI / 2.6 + (Math.random() - 0.5) * 0.5,
          Math.random() * Math.PI,
          0
        );
        piece.add(branch);
      }
    } else if (roll < 0.78) {
      // Scallop shell, folded into a faceted fan.
      const shell = new THREE.Mesh(
        new THREE.ConeGeometry(0.2 + Math.random() * 0.12, 0.1, 5),
        this.shellMat
      );
      shell.rotation.x = Math.PI;
      shell.scale.set(1, 0.65, 1);
      piece.add(shell);
    } else if (roll < 0.9) {
      // Crab carapace, half buried with its claws out.
      const crab = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), this.crabMat);
      crab.scale.set(1.15, 0.4, 0.85);
      piece.add(crab);
      for (let c = 0; c < 2; c++) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.09), this.crabMat);
        claw.position.set(0.22, 0, c === 0 ? 0.14 : -0.14);
        piece.add(claw);
      }
    } else {
      // Weathered stone, flattened the way surf stones sit.
      const s = 0.16 + Math.random() * 0.2;
      const stone = new THREE.Mesh(
        Math.random() < 0.5
          ? new THREE.DodecahedronGeometry(s, 0)
          : new THREE.IcosahedronGeometry(s * 0.9, 0),
        this.rockMat
      );
      stone.scale.set(1.1, 0.62, 1);
      piece.add(stone);
    }

    piece.rotation.y = Math.random() * Math.PI * 2;
    const sc = 0.85 + Math.random() * 0.5;
    piece.scale.set(sc, sc, sc);
    piece.traverse(o => {
      o.castShadow = true;
    });
    return piece;
  }

  // 4.5 Scattered beach detail across the dry sand, so the mid-beach reads as a
  //     real shore rather than a blank plane. Spread over the whole stretch the
  //     player can see and walk, not just the strip behind the wrack line, and
  //     bedded on the terrain sampler.
  buildBeachDetail() {
    for (let i = 0; i < 62; i++) {
    const x = -8 + Math.random() * 44;
    const z = (Math.random() - 0.5) * 52;
    const s = 0.08 + Math.random() * 0.2;

    const roll = Math.random();
    let detail: THREE.Mesh;
    if (roll < 0.4) {
      detail = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), this.rockMat);
    } else if (roll < 0.66) {
      detail = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), this.rockMat);
    } else if (roll < 0.86) {
      const stickGeo = new THREE.CylinderGeometry(s * 0.5, s * 0.5, s * 3.4, 5);
      stickGeo.rotateZ(Math.PI / 2);
      detail = new THREE.Mesh(stickGeo, this.driftwoodMat);
    } else {
      // Odd strand of kelp dried onto the sand.
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(s * 4.2, s * 0.35, s * 0.85),
        this.kelpMat
      );
      detail = blade;
    }

    const isStone = roll < 0.75;
    detail.position.set(x, groundHeightAt(x, z) + s * 0.2, z);
    detail.rotation.set(
      isStone ? Math.random() * Math.PI : (Math.random() - 0.5) * 0.2,
      Math.random() * Math.PI * 2,
      isStone ? Math.random() * Math.PI : (Math.random() - 0.5) * 0.2
    );
    // Tiny debris: receive shadows but stay out of the shadow pass.
    detail.receiveShadow = true;
    this.rockGroup.add(detail);

    // A couple of neighbours for the stones, because shingle on a beach arrives
    // in patches rather than one pebble at a time.
    if (isStone && Math.random() < 0.5) {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) {
        const cs = s * (0.5 + Math.random() * 0.6);
        const chip = new THREE.Mesh(
          new THREE.DodecahedronGeometry(cs, 0),
          this.rockMat
        );
        const cx = x + (Math.random() - 0.5) * 1.6;
        const cz = z + (Math.random() - 0.5) * 1.6;
        chip.position.set(cx, groundHeightAt(cx, cz) + cs * 0.15, cz);
        chip.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        chip.scale.set(1.1, 0.6, 1);
        chip.receiveShadow = true;
        this.rockGroup.add(chip);
      }
    }
    }
  }

  // 5. Build Low-Poly Wave Breaker Surge
  //
  //     Nothing here is a finished shape: the breaker is four flat water surfaces
  //     that get draped onto the beach every frame (see update()). Local +X is
  //     out to sea, local 0 is the toe of the wave.
  buildLowPolyWave() {
    // A long-shore sheet of water, positioned along local X and stored with its
    // untouched vertex positions so update() can rebuild it in place.
    const waterSheet = (
      x0: number,
      x1: number,
      segX: number,
      segZ: number,
      mat: THREE.Material
    ) => {
      const len = x1 - x0;
      const geo = new THREE.PlaneGeometry(len, WAVE_DEPTH, segX, segZ);
      geo.rotateX(-Math.PI / 2);
      geo.translate(x0 + len / 2, 0, 0);
      const nonIndexed = geo.toNonIndexed();
      nonIndexed.computeVertexNormals();
      const mesh = new THREE.Mesh(nonIndexed, mat);
      return {
        mesh,
        geo: nonIndexed,
        initial: new Float32Array(nonIndexed.attributes.position.array)
      };
    };

    // 5.1 The swell body: short steep face, crest, then a long tail that eases
    //     back down into the open sea behind it.
    const swell = waterSheet(WAVE_SWELL_X0, WAVE_SWELL_X1, 14, 12, this.waveSwellMat);
    this.waveSwellMesh = swell.mesh;
    this.waveSwellGeo = swell.geo;
    this.swellInitialPositions = swell.initial;
    this.waveGroup.add(this.waveSwellMesh);

    // 5.2 The breaking lip: whitewater over the face of the swell and over the
    //     crest. One piece, so the foam never reads as two separate stripes.
    const lip = waterSheet(WAVE_LIP_X0, WAVE_LIP_X1, 8, 14, this.waveFoamMat);
    this.waveLipMesh = lip.mesh;
    this.waveLipGeo = lip.geo;
    this.lipInitialPositions = lip.initial;
    this.waveGroup.add(this.waveLipMesh);

    // 5.3 The shallow sheet of water connecting the breaker back to the sea.
    const sheet = waterSheet(WAVE_SHEET_X0, WAVE_SHEET_X1, 13, 9, this.waveSheetMat);
    this.waveSheetMesh = sheet.mesh;
    this.waveSheetGeo = sheet.geo;
    this.sheetInitialPositions = sheet.initial;
    this.waveSheetMesh.renderOrder = 1;
    this.waveGroup.add(this.waveSheetMesh);
  }

  // 6. Build Low-Poly Scavenger Creature (Hero Hermit Scuttler)
  buildLowPolyCharacter() {
    this.blobGroup.position.set(0, 0.85, 0);

    // 6.1 Low-Poly Octagonal Contact Shadow
    const shadowGeo = new THREE.PlaneGeometry(3.6, 3.6);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: createLowPolyShadowTexture(),
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    this.blobShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.blobShadow.position.y = -0.74;
    this.blobGroup.add(this.blobShadow);

    // 6.2 Low-Poly Faceted Carapace/Shell
    const shellGeo = new THREE.IcosahedronGeometry(1.22, 1);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x2278A6, // Low-poly coastal teal
      roughness: 0.28,
      metalness: 0.12,
      flatShading: true
    });
    this.blobShell = new THREE.Mesh(shellGeo, shellMat);
    this.blobShell.castShadow = true;
    this.blobShell.receiveShadow = true;
    this.blobGroup.add(this.blobShell);

    // 6.3 Low-Poly Underbelly
    const bellyGeo = new THREE.DodecahedronGeometry(1.0, 0);
    const bellyMat = new THREE.MeshStandardMaterial({
      color: 0x165576,
      roughness: 0.45,
      metalness: 0.08,
      flatShading: true
    });
    this.blobUnderbelly = new THREE.Mesh(bellyGeo, bellyMat);
    this.blobUnderbelly.position.y = -0.22;
    this.blobGroup.add(this.blobUnderbelly);

    // 6.4 Low-Poly Faceted Gem Eyes on Stalks
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xFDFBF7,
      roughness: 0.1,
      metalness: 0.05,
      flatShading: true
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x14161A });

    // Left Eye Stalk & Gem
    this.eyeLeftGroup = new THREE.Group();
    const stalkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.45, 5);
    const stalkL = new THREE.Mesh(stalkGeo, bellyMat);
    stalkL.position.y = 0.22;
    const eyeGemL = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), eyeMat);
    eyeGemL.position.y = 0.45;
    const pupilL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), pupilMat);
    pupilL.position.set(0.06, 0.45, 0.14);

    this.eyeLeftGroup.add(stalkL);
    this.eyeLeftGroup.add(eyeGemL);
    this.eyeLeftGroup.add(pupilL);
    this.eyeLeftGroup.position.set(0.55, 0.65, 0.65);
    this.blobGroup.add(this.eyeLeftGroup);

    // Right Eye Stalk & Gem
    this.eyeRightGroup = new THREE.Group();
    const stalkR = new THREE.Mesh(stalkGeo, bellyMat);
    stalkR.position.y = 0.22;
    const eyeGemR = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), eyeMat);
    eyeGemR.position.y = 0.45;
    const pupilR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), pupilMat);
    pupilR.position.set(0.06, 0.45, 0.14);

    this.eyeRightGroup.add(stalkR);
    this.eyeRightGroup.add(eyeGemR);
    this.eyeRightGroup.add(pupilR);
    this.eyeRightGroup.position.set(0.9, 0.65, 0.35);
    this.blobGroup.add(this.eyeRightGroup);

    // 6.5 Low-Poly Beveled Claws
    const clawMat = new THREE.MeshStandardMaterial({
      color: 0xE8A317, // Warm golden-amber claws
      roughness: 0.32,
      metalness: 0.2,
      flatShading: true
    });
    const clawGeo = new THREE.ConeGeometry(0.18, 0.65, 4);
    clawGeo.rotateZ(-Math.PI / 3);

    this.clawLeft = new THREE.Mesh(clawGeo, clawMat);
    this.clawLeft.position.set(0.85, 0.05, 0.85);
    this.clawLeft.castShadow = true;
    this.blobGroup.add(this.clawLeft);

    this.clawRight = new THREE.Mesh(clawGeo, clawMat);
    this.clawRight.position.set(1.15, 0.05, 0.3);
    this.clawRight.rotation.y = -Math.PI / 4;
    this.clawRight.castShadow = true;
    this.blobGroup.add(this.clawRight);

    // 6.6 Four Low-Poly Scuttling Legs (Angular Prisms)
    this.playerLegs = [];
    const legGeo = new THREE.BoxGeometry(0.16, 0.52, 0.16);
    const legConfigs = [
      { x: 0.55, y: -0.68, z: 0.72 },
      { x: 0.55, y: -0.68, z: -0.72 },
      { x: -0.55, y: -0.68, z: 0.72 },
      { x: -0.55, y: -0.68, z: -0.72 }
    ];
    for (const cfg of legConfigs) {
      const leg = new THREE.Mesh(legGeo, bellyMat);
      leg.position.set(cfg.x, cfg.y, cfg.z);
      this.blobGroup.add(leg);
      this.playerLegs.push(leg);
    }
  }

  // 7. Create Low-Poly 3D Treasures & Collectibles
  createLootMesh(type: number, band: 'near' | 'mid' | 'far'): THREE.Group {
    const group = new THREE.Group();

    let mesh: THREE.Object3D;

    switch (type) {
      case 0: {
        // Low-Poly Spiral Ammonite Shell (Faceted Torus segments)
        const geo = new THREE.TorusGeometry(0.55, 0.22, 6, 12);
        mesh = new THREE.Mesh(
          geo,
          new THREE.MeshStandardMaterial({
            color: 0xFDFBF7,
            roughness: 0.35,
            metalness: 0.08,
            flatShading: true
          })
        );
        mesh.rotation.x = Math.PI / 2;
        break;
      }
      case 1: {
        // Low-Poly Tumbled Sea Glass Gem (Sharp faceted Dodecahedron)
        const geo = new THREE.DodecahedronGeometry(0.52, 0);
        mesh = new THREE.Mesh(geo, this.gemMat);
        break;
      }
      case 2: {
        // Low-Poly Gold Pirate Doubloon (Octagonal coin with faceted bevel)
        mesh = new THREE.Group();
        const coinGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.14, 8);
        const coin = new THREE.Mesh(coinGeo, this.goldMat);
        coin.rotation.x = Math.PI / 2;

        const starGeo = new THREE.OctahedronGeometry(0.24, 0);
        const star = new THREE.Mesh(starGeo, this.goldMat);
        star.position.z = 0.09;
        mesh.add(coin);
        mesh.add(star);
        break;
      }
      case 3: {
        // Low-Poly Driftwood Totem (Hexagonal beveled log)
        const geo = new THREE.CylinderGeometry(0.3, 0.44, 1.3, 6);
        mesh = new THREE.Mesh(geo, this.woodMat);
        break;
      }
      case 4: {
        // Low-Poly Giant Clam with Glowing Pearl
        mesh = new THREE.Group();
        const clamMat = new THREE.MeshStandardMaterial({
          color: 0x1E3C56,
          roughness: 0.45,
          metalness: 0.1,
          flatShading: true
        });
        const halfGeo = new THREE.CylinderGeometry(0.54, 0.1, 0.3, 6);
        const clam1 = new THREE.Mesh(halfGeo, clamMat);
        clam1.rotation.x = Math.PI / 2;
        const clam2 = new THREE.Mesh(halfGeo, clamMat);
        clam2.rotation.x = Math.PI / 2 + 0.45;
        clam2.position.set(0, 0.12, -0.15);

        // Glowing Faceted Icosahedron Pearl
        const pearlGeo = new THREE.IcosahedronGeometry(0.25, 0);
        const pearlMat = new THREE.MeshStandardMaterial({
          color: 0xFFFFFF,
          roughness: 0.08,
          metalness: 0.15,
          flatShading: true
        });
        const pearl = new THREE.Mesh(pearlGeo, pearlMat);
        pearl.position.set(0, 0.12, 0);

        mesh.add(clam1);
        mesh.add(clam2);
        mesh.add(pearl);
        break;
      }
      case 5: {
        // Low-Poly Starfish (5 sharp angular tapered arms)
        mesh = new THREE.Group();
        const starfishMat = new THREE.MeshStandardMaterial({
          color: 0xE25B45, // Coral star
          roughness: 0.45,
          flatShading: true
        });
        for (let i = 0; i < 5; i++) {
          const armGeo = new THREE.ConeGeometry(0.2, 0.74, 4);
          armGeo.rotateZ(Math.PI / 2);
          const arm = new THREE.Mesh(armGeo, starfishMat);
          arm.rotation.y = (i * Math.PI * 2) / 5;
          mesh.add(arm);
        }
        break;
      }
      case 6: {
        // Low-Poly Message in a Bottle (Hexagonal glass flask)
        mesh = new THREE.Group();
        const bottleGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.85, 6);
        const bottleMat = new THREE.MeshPhysicalMaterial({
          color: 0x93C5FD,
          roughness: 0.12,
          metalness: 0.05,
          transmission: 0.88,
          ior: 1.5,
          transparent: true,
          opacity: 0.88,
          flatShading: true
        });
        const bottle = new THREE.Mesh(bottleGeo, bottleMat);

        const corkGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.22, 6);
        const cork = new THREE.Mesh(corkGeo, this.woodMat);
        cork.position.y = 0.52;

        const scrollGeo = new THREE.BoxGeometry(0.12, 0.48, 0.12);
        const scrollMat = new THREE.MeshStandardMaterial({
          color: 0xFDE68A,
          roughness: 0.8,
          flatShading: true
        });
        const scroll = new THREE.Mesh(scrollGeo, scrollMat);

        mesh.add(bottle);
        mesh.add(cork);
        mesh.add(scroll);
        mesh.rotation.z = Math.PI / 3.4;
        break;
      }
      case 7:
      default: {
        // Low-Poly Amber Nugget (Faceted dodecahedron crystal)
        const geo = new THREE.DodecahedronGeometry(0.48, 0);
        const amberMat = new THREE.MeshStandardMaterial({
          color: 0xE89828,
          roughness: 0.2,
          metalness: 0.1,
          flatShading: true
        });
        mesh = new THREE.Mesh(geo, amberMat);
        break;
      }
    }

    mesh.castShadow = true;
    group.add(mesh);

    if (band === 'far' || band === 'mid') {
      const sparkGroup = new THREE.Group();
      const sparkGeo = new THREE.OctahedronGeometry(band === 'far' ? 0.28 : 0.2, 0);
      const sparkMat = new THREE.MeshBasicMaterial({ color: 0xFFFBEB });
      const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
      sparkMesh.position.y = 0.95;
      sparkGroup.add(sparkMesh);
      group.add(sparkGroup);
      group.userData.sparkle = sparkGroup;
    }

    return group;
  }

  // 8. Low-Poly Particle Emitters
  addHaulParticle(fromX: number, fromY: number, fromZ: number, toX: number, toY: number) {
    const mesh = new THREE.Mesh(
      this.polyOctaGeo,
      new THREE.MeshBasicMaterial({ color: 0x93E3FD })
    );
    mesh.position.set(fromX, fromY, fromZ);
    this.scene.add(mesh);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.max(0.1, Math.hypot(dx, dy));
    const speed = 19;
    this.haulParticles.push({
      mesh,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed + 0.8,
      vz: (Math.random() - 0.5) * 1.5,
      life: 0,
      maxLife: 0.38 + Math.random() * 0.15
    });
  }

  addDustParticle(x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(
      this.polyCubeGeo,
      new THREE.MeshBasicMaterial({ color: 0xD6BC88 })
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.dustParticles.push({
      mesh,
      vx: (Math.random() - 0.7) * 2.2,
      vy: Math.random() * 1.5 + 0.4,
      vz: (Math.random() - 0.5) * 1.5,
      life: 0,
      maxLife: 0.45 + Math.random() * 0.2
    });
  }

  addSprayParticle(x: number, y: number, z: number, isGold: boolean) {
    const mesh = new THREE.Mesh(
      this.polyTetraGeo,
      new THREE.MeshBasicMaterial({
        color: isGold ? 0xF8C63E : 0xFFFFFF
      })
    );
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.sprayParticles.push({
      mesh,
      vx: (Math.random() - 0.3) * 11,
      vy: Math.random() * 10 + 5,
      vz: (Math.random() - 0.5) * 8,
      rx: (Math.random() - 0.5) * 12,
      ry: (Math.random() - 0.5) * 12,
      life: 0,
      maxLife: 0.75 + Math.random() * 0.35
    });
  }

  triggerImpactShake(intensity: number = 1.3) {
    this.shakeIntensity = intensity;
  }

  // A tall, narrow viewport has a narrow horizontal field of view, which used to
  // squeeze the sea out of frame on a phone. Widening the vertical FOV as the
  // aspect narrows keeps the waterline and the open water on screen in portrait,
  // and leaves landscape framing exactly as it was.
  applyFramingForAspect(aspect: number) {
    // Saturating at 0.4 rather than 0.55 matters: a phone whose browser keeps a
    // toolbar sits nearer aspect 0.6 than a bare 0.46 screen, and it wants the
    // full phone framing rather than a half-applied blend that leaves the
    // scuttler drifting toward the edge of the frame.
    this.portraitness = Math.max(0, Math.min(1, (1 - aspect) / 0.4));
    // Only a gentle widening here: the portrait camera below does the real work of
    // keeping the scuttler large, so the field of view does not have to over-expand.
    this.camera.fov = 46 + this.portraitness * 6;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  onResize = () => {
    if (this.isDisposed || !this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.applyFramingForAspect(w / h);
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  };

  // 9. Frame-by-Frame Update Loop
  update(
    dt: number,
    heldScore: number,
    isHolding: boolean,
    wrackLineRatio: number,
    waveRatio: number,
    cyclePhase: string,
    isKingTide: boolean,
    lootItems: Loot3DItem[],
    playerX3D: number = 0,
    isMoving: boolean = false,
    moveDir: number = 0
  ) {
    if (this.isDisposed) return;
    this.oceanTime += dt;

    // 9.0 Living scenery: drifting clouds, swaying grass, breathing pines, sun shimmer
    for (let i = 0; i < this.cloudDrift.length; i++) {
      const c = this.cloudDrift[i];
      c.position.x -= dt * (0.5 + i * 0.14);
      if (c.position.x < -54) c.position.x = 54;
    }
    for (let i = 0; i < this.swayGrass.length; i++) {
      const g = this.swayGrass[i];
      g.rotation.z = Math.sin(this.oceanTime * 1.15 + i * 1.7) * 0.07 + 0.02;
      g.rotation.x = Math.cos(this.oceanTime * 0.9 + i * 1.13) * 0.04;
    }
    for (let i = 0; i < this.swayTrees.length; i++) {
      this.swayTrees[i].rotation.z = Math.sin(this.oceanTime * 0.7 + i * 2.3) * 0.018;
    }
    if (this.sunCorona && this.sunCoronaMat) {
      this.sunCorona.scale.setScalar(1 + Math.sin(this.oceanTime * 0.8) * 0.06);
      this.sunCoronaMat.opacity = 0.3 + Math.sin(this.oceanTime * 0.55) * 0.09;
    }

    // 9.1 Animate Low-Poly Ocean Vertices
    if (this.seaGeoNonIndexed && this.seaInitialPositions) {
      const pos = this.seaGeoNonIndexed.attributes.position;
      const count = pos.count;
      const t = this.oceanTime;

      for (let i = 0; i < count; i++) {
        const x = this.seaInitialPositions[i * 3];
        const initialY = this.seaInitialPositions[i * 3 + 1];
        const z = this.seaInitialPositions[i * 3 + 2];

        // Faceted polygonal wave oscillations
        const wave =
          Math.sin(x * 0.28 + t * 2.4) * 0.42 +
          Math.cos(z * 0.32 + t * 1.9) * 0.32 +
          Math.sin(x * 0.12 - z * 0.15 + t * 1.2) * 0.2;

        pos.setY(i, initialY + wave);
      }
      pos.needsUpdate = true;
      this.seaGeoNonIndexed.computeVertexNormals();
    }

    // 9.2 Position Wrack Line Flotsam
    const wrackTargetX = 4 + wrackLineRatio * 14;
    this.wrackGroup.position.x = wrackTargetX;
    // Bed every piece of flotsam on the sand it is currently passing over, so
    // the debris line rides the dunes and the shore slope as it advances.
    for (const item of this.wrackItems) {
      item.mesh.position.y = groundHeightAt(wrackTargetX + item.x, item.z) + item.lift;
    }

    // 9.3 Low-Poly Wave Breaker Surge
    const wave3DX = 52 - waveRatio * 55;
    this.waveGroup.position.x = wave3DX;
    // Rise as it feels the bottom, with a slow vertical swell under it.
    this.waveGroup.position.y = waveRatio * 0.25 + Math.sin(this.oceanTime * 1.7) * 0.07;
    // The surge is water and nothing else, so between waves there is nothing to
    // show. Without this the swell and its sheet would sit out on the open sea as
    // loose geometry through all of low tide.
    this.waveGroup.visible = waveRatio > 0.04;

    const wGroupX = this.waveGroup.position.x;
    const wGroupY = this.waveGroup.position.y;
    const wt = this.oceanTime;

    // Shoaling: the face steepens, the crest drifts shoreward, and the body eases
    // off once it has broken.
    const collapse = waveRatio > 0.86 ? Math.max(0, 1 - (waveRatio - 0.86) / 0.14) : 1;
    const bodyH = WAVE_HEIGHT * (1 + waveRatio * 0.5) * (0.35 + 0.65 * collapse);
    const crestX = WAVE_PEAK_X - waveRatio * 0.9;
    const longShore = (lz: number) =>
      0.86 + 0.14 * Math.sin(lz * 0.3 + wt * 0.55) + 0.08 * Math.sin(lz * 0.85 - wt * 1.35);

    // Re-drape one water surface onto the beach. `shape` is the height of the water
    // above the local waterline; the waterline itself comes from the terrain the
    // surge is crossing, which is what ties the breaker to the sea.
    const drape = (
      geo: THREE.BufferGeometry | undefined,
      initial: Float32Array | undefined,
      shape: (lx: number, lz: number) => number
    ) => {
      if (!geo || !initial) return;
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = initial[i * 3];
        const lz = initial[i * 3 + 2];
        pos.setY(i, waterSurfaceY(wGroupX + lx, lz) - wGroupY + shape(lx, lz));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    };

    drape(this.waveSwellGeo, this.swellInitialPositions, (lx, lz) => {
      // The inland edge of the body is buried under the sand over an irregular
      // distance, so the waterline wanders along the shore instead of being a
      // ruled line running the length of the beach.
      const reach = 2.6 + 1.3 * Math.sin(lz * 0.7) + 0.7 * Math.sin(lz * 2.1 + 0.8);
      const buried = -1.1 * Math.max(0, 1 - (lx - WAVE_SWELL_X0) / reach);
      const roll = 0.09 * Math.sin(lx * 0.6 - wt * 1.7);
      return waveProfile(lx, crestX, bodyH * longShore(lz)) + buried + roll;
    });

    // The lip caps the crest and sinks back into the swell just behind the peak, so
    // the foam dissolves into the water instead of ending on a straight edge.
    drape(this.waveLipGeo, this.lipInitialPositions, (lx, lz) => {
      const body = waveProfile(lx, crestX, bodyH * longShore(lz));
      const settle = Math.max(0, lx - crestX) * 0.85;
      const churn = Math.sin(lz * 1.7 + wt * 6) * 0.06 + Math.sin(lz * 4.1 - wt * 3) * 0.03;
      const lipReach = 2.4 + 1.2 * Math.sin(lz * 0.8 + 0.6) + 0.6 * Math.sin(lz * 2.3);
      const buried = -1.0 * Math.max(0, 1 - (lx - WAVE_LIP_X0) / lipReach);
      return body + 0.08 + churn - settle + buried;
    });

    // The shallow sheet running from the breaker back out to the open sea. Its
    // inland end is buried under the sand, so the waterline is simply where the
    // beach crosses the sheet.
    drape(this.waveSheetGeo, this.sheetInitialPositions, (lx, lz) => {
      const ripple =
        0.05 * Math.sin(lx * 0.7 + wt * 2.1) + 0.04 * Math.sin(lz * 0.5 - wt * 1.6);
      // The wetted edge wanders along the shore instead of ending on a ruled line.
      const reach = 2.8 + 1.4 * Math.sin(lz * 0.6) + 0.7 * Math.sin(lz * 1.9 + 1.2);
      const buried = -1.0 * Math.max(0, 1 - (lx - WAVE_SHEET_X0) / reach);
      return ripple + buried;
    });

    if (waveRatio > 0.05 && waveRatio < 0.95 && Math.random() < 0.45) {
      this.addSprayParticle(
        wave3DX + crestX + (Math.random() - 0.5) * 3,
        waterSurfaceY(wave3DX + crestX, 0) + bodyH * 0.7,
        (Math.random() - 0.5) * 28,
        false
      );
    }

    // 9.4 Hero Hermit Scuttler Positioning & Animation
    //      The creature and everything riding on it sit on the sand it is actually
    //      standing on, rather than on a straight ramp that only matches the beach
    //      near the middle of the shore.
    const groundSlopeY = groundHeightAt(playerX3D, 0);

    // 9.4a Greed made visible. The shell swells with the value riding on it, so a big
    //       held score reads as a big, obviously-risky body. Lift the group by the
    //       same factor so the legs keep standing on the sand instead of sinking in.
    const growTarget = 1 + Math.min(1, Math.max(0, heldScore) / 300) * 0.3;
    this.blobGrowScale += (growTarget - this.blobGrowScale) * Math.min(1, dt * 3.2);
    const grow = this.blobGrowScale;

    this.blobGroup.position.x = playerX3D;
    this.blobGroup.scale.setScalar(grow);
    this.blobGroup.position.y = groundSlopeY + 0.98 * grow;

    // Subtle breathing / scuttling sway
    const breathing = Math.sin(this.oceanTime * 3) * 0.04 * grow;
    this.blobGroup.position.y += breathing;

    // Tilt body based on forward/backward movement
    const targetTiltZ = isMoving ? (moveDir > 0 ? -0.16 : 0.14) : 0;
    this.blobShell.rotation.z += (targetTiltZ - this.blobShell.rotation.z) * Math.min(1, dt * 10);

    // Eye Gem tracking & blinking
    if (this.eyeLeftGroup && this.eyeRightGroup) {
      const eyeLookX = Math.sin(this.oceanTime * 1.5) * 0.12;
      this.eyeLeftGroup.rotation.y = eyeLookX;
      this.eyeRightGroup.rotation.y = eyeLookX;
    }

    // Claw animation when hauling or gentle idle twitch
    if (this.clawLeft && this.clawRight) {
      const clawIdle = !isMoving && !isHolding ? Math.sin(this.oceanTime * 2.5) * 0.07 : 0;
      const clawPump = isHolding ? Math.sin(this.oceanTime * 12) * 0.28 : clawIdle;
      this.clawLeft.rotation.z = -Math.PI / 3 + clawPump;
      this.clawRight.rotation.z = -Math.PI / 3 - clawPump;
    }

    // Scuttle legs when moving
    if (this.playerLegs.length >= 4) {
      for (let i = 0; i < this.playerLegs.length; i++) {
        const leg = this.playerLegs[i];
        if (isMoving) {
          const legPhase = this.oceanTime * 16 + i * Math.PI * 0.5;
          leg.rotation.x = Math.sin(legPhase) * 0.45;
          leg.rotation.z = Math.cos(legPhase) * 0.25;
        } else {
          leg.rotation.x *= 0.85;
          leg.rotation.z *= 0.85;
        }
      }
    }

    // Sand dust puffs when scuttling
    if (isMoving && Math.random() < 0.35) {
      this.addDustParticle(
        playerX3D + (Math.random() - 0.5) * 0.8,
        groundSlopeY + 0.1,
        (Math.random() - 0.5) * 0.8
      );
    }

    // Haul suction particles streaming towards creature
    if (isHolding) {
      for (const item of lootItems) {
        if (!item.isAttached && Math.random() < 0.28) {
          this.addHaulParticle(
            item.x,
            item.y + 0.4,
            item.z,
            playerX3D,
            0.85 + groundSlopeY
          );
        }
      }
    }

    // 9.5 Camera Tracking with Low-Poly Isometric Flare.
    //     A tall, narrow screen has a narrow horizontal field of view, so the
    //     scuttler has to be framed deliberately: the camera sits closer and
    //     follows it tightly to keep it large, while the aim trails a little
    //     behind the direction of travel so the character visibly lunges as it
    //     scuttles instead of sitting pinned to the middle of the frame.
    const p = this.portraitness;

    // How fast the scuttler is actually crossing the sand, smoothed slightly so a
    // single stuttering frame cannot fling the camera around.
    // A restart teleports the scuttler back to the start of the shore, and a
    // long frame gap would fake an enormous speed; neither is scuttling, so
    // anything beyond a real step is ignored rather than flung into the camera.
    const step = playerX3D - this.lastPlayerX;
    const instSpeed = dt > 0 && Math.abs(step) < 2 ? step / dt : 0;
    this.lastPlayerX = playerX3D;
    this.playerSpeed += (instSpeed - this.playerSpeed) * Math.min(1, dt * 9);

    // Portrait follows the scuttler far more tightly than landscape does. The
    // beach runs 21 world units and a tall frame only shows about five of them,
    // so a loose follow leaves the character aimed at dead centre but standing
    // that much further from the lens at the top of the shore, where it shrinks
    // to a fifth of the screen width. A tight follow holds it at one size for
    // the whole beach and makes the shore rush past instead.
    const follow = 0.65 + p * 0.28;
    const targetCamX = playerX3D * follow;
    this.currentCamX += (targetCamX - this.currentCamX) * Math.min(1, dt * 4.5);

    this.camera.position.x = this.baseCameraPos.x + this.currentCamX;
    this.camera.position.y = this.baseCameraPos.y - p * 0.2;
    this.camera.position.z = this.baseCameraPos.z - p * 2.0;

    // Landscape keeps the original framing. Portrait leans the aim off the
    // character in whatever direction it is running.
    const landscapeLookX = this.baseCameraTarget.x + this.currentCamX * 0.8;
    const portraitLookX = portraitAimX(
      playerX3D,
      this.playerSpeed,
      frameHalfWidth(this.camera.position.z, this.camera.fov, this.camera.aspect)
    );
    const lookTarget = new THREE.Vector3(
      landscapeLookX * (1 - p) + portraitLookX * p,
      this.baseCameraTarget.y,
      this.baseCameraTarget.z
    );

    // Screen Shake
    if (this.shakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.6;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.8);
    }

    this.camera.lookAt(lookTarget);

    // 9.6 Update Spray Particles
    for (let i = this.sprayParticles.length - 1; i >= 0; i--) {
      const p = this.sprayParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.sprayParticles.splice(i, 1);
      } else {
        p.vy -= 22 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.rx * dt;
        p.mesh.rotation.y += p.ry * dt;
        const progress = p.life / p.maxLife;
        p.mesh.scale.setScalar(Math.max(0.1, 1 - progress));
      }
    }

    // 9.7 Update Dust Particles
    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const p = this.dustParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.dustParticles.splice(i, 1);
      } else {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        const progress = p.life / p.maxLife;
        p.mesh.scale.setScalar(Math.max(0.1, 1 - progress));
      }
    }

    // 9.8 Update Haul Suction Particles
    for (let i = this.haulParticles.length - 1; i >= 0; i--) {
      const p = this.haulParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.haulParticles.splice(i, 1);
      } else {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        const progress = p.life / p.maxLife;
        p.mesh.scale.setScalar(Math.max(0.1, 1 - progress));
      }
    }

    // 9.9 Subtle Floating Cloud Drift
    if (this.cloudsGroup) {
      this.cloudsGroup.position.x = Math.sin(this.oceanTime * 0.05) * 4;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.isDisposed = true;
    window.removeEventListener('resize', this.onResize);
    try {
      this.renderer.dispose();
      if (this.container && this.renderer.domElement) {
        this.container.removeChild(this.renderer.domElement);
      }
    } catch {}
  }
}
