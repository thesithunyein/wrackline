import * as THREE from 'three';

/**
 * Little portraits of the actual creature, one per shell colour.
 *
 * The unlock row used to be four coloured dots, which is a colour picker, not a
 * character. This builds the same low-poly crab the shore uses - carapace, underbelly,
 * eyes on stalks, amber claws, four legs - and renders it once per colour into a data
 * URL. A single throwaway renderer draws all of them and is disposed afterwards, so a
 * sheet with four portraits costs one WebGL context for a few frames, not four that
 * sit around for the life of the page.
 *
 * The result is cached for the life of the tab: shell colours never change, so there is
 * nothing to re-render when the sheet is opened again.
 */

const cache = new Map<string, string>();

function buildCrab(color: string): THREE.Group {
  const crab = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.28,
    metalness: 0.12,
    flatShading: true
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0x165576,
    roughness: 0.45,
    metalness: 0.08,
    flatShading: true
  });
  const clawMat = new THREE.MeshStandardMaterial({
    color: 0xe8a317,
    roughness: 0.32,
    metalness: 0.2,
    flatShading: true
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xfdfbf7,
    roughness: 0.1,
    metalness: 0.05,
    flatShading: true
  });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x14161a });

  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.22, 1), shellMat);
  crab.add(shell);

  const belly = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 0), bellyMat);
  belly.position.y = -0.22;
  crab.add(belly);

  const stalkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.45, 5);
  const eyeGeo = new THREE.OctahedronGeometry(0.24, 0);
  const pupilGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const eyeSpots: [number, number][] = [
    [0.55, 0.65],
    [0.9, 0.35]
  ];
  for (const [x, z] of eyeSpots) {
    const eye = new THREE.Group();
    const stalk = new THREE.Mesh(stalkGeo, bellyMat);
    stalk.position.y = 0.22;
    const gem = new THREE.Mesh(eyeGeo, eyeMat);
    gem.position.y = 0.45;
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(0.06, 0.45, 0.14);
    eye.add(stalk, gem, pupil);
    eye.position.set(x, 0.65, z);
    crab.add(eye);
  }

  const clawGeo = new THREE.ConeGeometry(0.18, 0.65, 4);
  clawGeo.rotateZ(-Math.PI / 3);
  const clawLeft = new THREE.Mesh(clawGeo, clawMat);
  clawLeft.position.set(0.85, 0.05, 0.85);
  crab.add(clawLeft);
  const clawRight = new THREE.Mesh(clawGeo, clawMat);
  clawRight.position.set(1.15, 0.05, 0.3);
  clawRight.rotation.y = -Math.PI / 4;
  crab.add(clawRight);

  const legGeo = new THREE.BoxGeometry(0.16, 0.52, 0.16);
  const legs: [number, number][] = [
    [0.55, 0.72],
    [0.55, -0.72],
    [-0.55, 0.72],
    [-0.55, -0.72]
  ];
  for (const [x, z] of legs) {
    const leg = new THREE.Mesh(legGeo, bellyMat);
    leg.position.set(x, -0.68, z);
    crab.add(leg);
  }

  // A three-quarter turn toward the camera, so it reads as a character and not a ball.
  crab.rotation.set(0.06, -0.55, 0.05);
  return crab;
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material?.dispose();
  });
}

/**
 * Renders one portrait per colour. Returns colour -> data URL, and an empty map if the
 * browser has no WebGL, in which case the caller keeps its old flat swatch.
 */
export function renderShellThumbnails(
  colors: string[],
  size = 192
): Record<string, string> {
  const pending = colors.filter(color => !cache.has(`${color}:${size}`));
  const out: Record<string, string> = {};

  if (pending.length > 0) {
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      const canvas = document.createElement('canvas');
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true
      });
      renderer.setSize(size, size, false);
      renderer.setClearColor(0x000000, 0);
      // Same grade as the shore, so the portrait and the live crab are the same
      // colour. Without it the untone-mapped render came out several shades darker.
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      // Pulled in from where the game camera sits: at 48px in the shell row a full
      // body shot left the creature as a speck, and the portrait is the whole point.
      const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
      camera.position.set(3.0, 3.7, 5.5);
      camera.lookAt(0.05, 0.0, 0);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb9cf, 1.25));
      const key = new THREE.DirectionalLight(0xffffff, 2.0);
      key.position.set(4, 7, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xcfe7f6, 0.8);
      rim.position.set(-5, 3, -4);
      scene.add(rim);

      for (const color of pending) {
        const crab = buildCrab(color);
        scene.add(crab);
        renderer.render(scene, camera);
        cache.set(`${color}:${size}`, canvas.toDataURL('image/png'));
        scene.remove(crab);
        disposeTree(crab);
      }
    } catch {
      // No WebGL: no portraits. The sheet falls back to the flat swatch.
    } finally {
      renderer?.dispose();
    }
  }

  for (const color of colors) {
    const url = cache.get(`${color}:${size}`);
    if (url) out[color] = url;
  }
  return out;
}
