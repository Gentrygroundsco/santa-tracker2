import * as THREE from 'three';

// A low-poly sleigh with Santa, his sack and nine reindeer, built from
// primitives. Faces +Z, with +Y up. Call `animate(seconds)` every frame.
export function createSleigh() {
  const root = new THREE.Group();
  // The simple built-in model; replaced by the detailed one once it loads.
  const body = new THREE.Group();
  root.add(body);
  let model = null;
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra });
  const red = mat(0xc8102e);
  const gold = mat(0xf5c542, { metalness: 0.8, roughness: 0.3 });
  const white = mat(0xffffff);
  const skin = mat(0xf2c9a0);
  const fur = mat(0x7a4a26);
  const darkFur = mat(0x4b2c16);
  const antler = mat(0xd9c3a0);
  const green = mat(0x1f7a3a);

  const mesh = (geo, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    return m;
  };

  // Sleigh body
  const sleigh = new THREE.Group();
  sleigh.add(mesh(new THREE.BoxGeometry(1, 0.45, 1.5), red, 0, 0.4, 0));
  sleigh.add(mesh(new THREE.BoxGeometry(1.04, 0.08, 1.54), gold, 0, 0.64, 0));
  sleigh.add(mesh(new THREE.BoxGeometry(1, 0.6, 0.25), red, 0, 0.7, -0.65));
  const curl = mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 16, Math.PI), red, 0, 0.5, 0.75);
  curl.rotation.y = Math.PI / 2;
  sleigh.add(curl);
  for (const x of [-0.45, 0.45]) {
    sleigh.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 2), gold, x, 0.02, 0.1));
    const tip = mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 12, Math.PI), gold, x, 0.22, 1.1);
    tip.rotation.y = Math.PI / 2;
    tip.rotation.z = -Math.PI / 2;
    sleigh.add(tip);
    for (const z of [-0.5, 0.5]) sleigh.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), gold, x, 0.12, z));
  }

  // Santa
  const santa = new THREE.Group();
  santa.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.55, 12), red, 0, 0.9, -0.2));
  santa.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 12), white, 0, 0.66, -0.2));
  santa.add(mesh(new THREE.SphereGeometry(0.16, 12, 10), skin, 0, 1.3, -0.2));
  const beard = mesh(new THREE.SphereGeometry(0.15, 10, 8), white, 0, 1.2, -0.08);
  beard.scale.set(1, 1.2, 0.6);
  santa.add(beard);
  santa.add(mesh(new THREE.ConeGeometry(0.16, 0.35, 12), red, 0, 1.55, -0.24));
  santa.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), white, 0, 1.73, -0.26));
  const brim = mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 16), white, 0, 1.4, -0.2);
  brim.rotation.x = Math.PI / 2;
  santa.add(brim);
  for (const x of [-0.25, 0.25]) {
    const arm = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), red, x, 0.95, 0.0);
    arm.rotation.x = Math.PI / 3;
    santa.add(arm);
  }
  sleigh.add(santa);

  // Gift sack and a couple of presents
  const sack = mesh(new THREE.SphereGeometry(0.35, 12, 10), mat(0x8a5a2b), 0, 0.95, -0.62);
  sack.scale.set(1, 1.15, 0.9);
  sleigh.add(sack);
  sleigh.add(mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), green, 0.3, 0.75, -0.5));
  sleigh.add(mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), mat(0x2b6cd9), -0.3, 0.75, -0.45));
  body.add(sleigh);

  // Reindeer: four pairs, then Rudolph in front.
  const deer = [];
  const makeReindeer = (rudolph) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.24, 0.24, 0.6), fur, 0, 0, 0));
    const neck = mesh(new THREE.BoxGeometry(0.1, 0.28, 0.12), fur, 0, 0.18, 0.28);
    neck.rotation.x = 0.5;
    g.add(neck);
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.26), fur, 0, 0.33, 0.4));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.08), white, 0, -0.02, -0.3));
    const legs = [];
    for (const [x, z] of [[-0.08, 0.22], [0.08, 0.22], [-0.08, -0.22], [0.08, -0.22]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, -0.1, z);
      pivot.add(mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), darkFur, 0, -0.15, 0));
      g.add(pivot);
      legs.push(pivot);
    }
    for (const x of [-0.06, 0.06]) {
      const a = mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.25, 5), antler, x, 0.5, 0.36);
      a.rotation.z = x < 0 ? 0.5 : -0.5;
      g.add(a);
      const b = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 5), antler, x * 1.9, 0.6, 0.38);
      b.rotation.x = 0.8;
      g.add(b);
    }
    let nose = null;
    if (rudolph) {
      nose = mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, 0.33, 0.55);
      g.add(nose);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('255,40,40'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      glow.scale.setScalar(0.6);
      glow.position.copy(nose.position);
      g.add(glow);
      nose = glow;
    } else {
      g.add(mesh(new THREE.SphereGeometry(0.035, 6, 6), darkFur, 0, 0.33, 0.54));
    }
    return { group: g, legs, nose };
  };

  for (let pair = 0; pair < 4; pair++) {
    for (const x of [-0.3, 0.3]) {
      const d = makeReindeer(false);
      d.group.position.set(x, 0.55, 1.9 + pair * 0.85);
      d.phase = pair * 0.9 + (x > 0 ? 0.4 : 0);
      deer.push(d);
      body.add(d.group);
    }
  }
  const rudolph = makeReindeer(true);
  rudolph.group.position.set(0, 0.55, 1.9 + 4 * 0.85);
  rudolph.phase = 4.2;
  deer.push(rudolph);
  body.add(rudolph.group);

  // Reins
  const reinPts = [];
  for (const d of deer) {
    reinPts.push(new THREE.Vector3(0, 0.95, -0.05), d.group.position.clone().add(new THREE.Vector3(0, 0.25, 0.3)));
  }
  body.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(reinPts),
    new THREE.LineBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.8 })));

  // A warm glow around the whole team so it is visible from far away.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('255,210,120'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3,
  }));
  halo.scale.setScalar(5);
  halo.position.set(0, 0.6, 2.2);
  root.add(halo);

  // Lights travel with the sleigh so it is lit on the night side.
  const light = new THREE.PointLight(0xffe2b0, 3, 12, 1);
  light.position.set(0, 3, 1.5);
  root.add(light);

  function animate(time, moving) {
    halo.material.opacity = 0.25 + 0.05 * Math.sin(time * 2.5);
    if (model) { model.animate(time, moving); return; }
    const speed = moving ? 9 : 3;
    for (const d of deer) {
      const s = Math.sin(time * speed + d.phase);
      d.group.position.y = 0.55 + (moving ? 0.06 : 0.02) * s;
      d.legs.forEach((leg, i) => { leg.rotation.x = (moving ? 0.7 : 0.15) * Math.sin(time * speed + d.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 1 : 0)); });
      if (d.nose) d.nose.scale.setScalar(0.5 + 0.2 * Math.sin(time * 4));
    }
    sleigh.position.y = 0.04 * Math.sin(time * 2);
    sleigh.rotation.z = moving ? 0.05 * Math.sin(time * 1.3) : 0;
  }

  const api = {
    object: root,
    animate,
    // Extent of the model in its own frame (+Z forward, +Y up), for camera framing.
    frame: { min: new THREE.Vector3(-0.6, 0, -0.9), max: new THREE.Vector3(0.6, 1.8, 5.8), santa: new THREE.Vector3(0, 1.3, -0.2) },
    useModel(m) {
      model = m;
      root.remove(body);
      root.add(m.object);
      api.frame = m.frame;
    },
    // The halo helps spot Santa from space but washes out close-up views.
    showHalo(on) { halo.visible = on; },
  };
  return api;
}

// Loads the detailed sleigh (a glTF with Santa, the sleigh and nine reindeer)
// and fits it to the same frame as the built-in model: facing +Z, +Y up, with
// the sleigh at the origin and Rudolph about 5 units ahead.
export async function loadSleighModel(url) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const nodes = [];
  scene.traverse((o) => nodes.push(o));
  const centerOf = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
  const sleighNode = nodes.find((o) => /^Sleigh/i.test(o.name)) || scene;
  const deer = nodes.filter((o) => /^Reindeer(-\d+)?_\d+$/.test(o.name));
  const sleighCenter = centerOf(sleighNode);

  // Forward is from the sleigh toward the reindeer; the file is Y-up.
  const up = new THREE.Vector3(0, 1, 0);
  let lead = sleighCenter.clone();
  let leadDist = 0;
  for (const d of deer) {
    const c = centerOf(d);
    const dist = c.distanceTo(sleighCenter);
    if (dist > leadDist) { leadDist = dist; lead = c; }
  }
  const forward = lead.clone().sub(sleighCenter);
  forward.sub(up.clone().multiplyScalar(forward.dot(up)));
  if (forward.lengthSq() < 1e-9) forward.set(0, 0, 1);
  forward.normalize();
  const lateral = new THREE.Vector3().crossVectors(up, forward).normalize();

  // Leg swing happens around the lateral axis, expressed in each leg's parent space.
  const legs = nodes.filter((o) => /^leg_(L|R)(F|R)_1/i.test(o.name)).map((leg, i) => {
    const parentQ = leg.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    return {
      node: leg,
      base: leg.quaternion.clone(),
      axis: lateral.clone().applyQuaternion(parentQ).normalize(),
      phase: (/F/.test(leg.name.slice(5, 6)) ? 0 : Math.PI) + (/L/.test(leg.name.slice(4, 5)) ? 0 : 0.6) + i * 0.37,
    };
  });

  const noseNode = nodes.find((o) => /Red_Nose/i.test(o.name));
  const nosePos = noseNode ? centerOf(noseNode) : null;

  // Orient and scale into a wrapper.
  const inner = new THREE.Group();
  inner.add(scene);
  scene.position.sub(sleighCenter);
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  inner.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lateral, up, forward).invert());
  const scale = 5.3 / Math.max(leadDist, 1e-6);
  inner.scale.setScalar(scale);
  inner.position.y = 0.4;

  scene.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      if (o.material && 'roughness' in o.material) o.material.roughness = Math.max(0.35, o.material.roughness);
    }
  });

  let noseGlow = null;
  if (nosePos) {
    noseGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('255,40,40'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    const p = nosePos.clone().sub(sleighCenter).applyQuaternion(inner.quaternion).multiplyScalar(scale);
    noseGlow.position.copy(p).add(inner.position);
    wrapper.add(noseGlow);
  }

  // The model's extent and Santa's seat, for framing the Santa Cam angles.
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const santaNode = nodes.find((o) => /^Santa/i.test(o.name));
  const frame = { min: box.min, max: box.max, santa: santaNode ? centerOf(santaNode) : new THREE.Vector3(0, 1.3, 0) };

  const q = new THREE.Quaternion();
  function animate(time, moving) {
    const speed = moving ? 9 : 2.5;
    const swing = moving ? 0.55 : 0.08;
    for (const l of legs) {
      q.setFromAxisAngle(l.axis, swing * Math.sin(time * speed + l.phase));
      l.node.quaternion.copy(q).multiply(l.base);
    }
    inner.position.y = 0.4 + 0.05 * Math.sin(time * 2);
    if (noseGlow) noseGlow.scale.setScalar(0.55 + 0.2 * Math.sin(time * 4));
  }

  return { object: wrapper, animate, frame };
}

const glowCache = {};
export function glowTexture(rgb) {
  if (glowCache[rgb]) return glowCache[rgb];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.25, `rgba(${rgb},0.45)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return (glowCache[rgb] = new THREE.CanvasTexture(c));
}

// Sparkles that trail behind the sleigh.
export function createTrail(count = 400) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1, map: glowTexture('255,255,255'), vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  let cursor = 0;
  const palette = [[1, 0.9, 0.7], [0.85, 0.9, 1]];

  function emit(pos, spread) {
    const i = cursor;
    cursor = (cursor + 1) % count;
    positions[i * 3] = pos.x + (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * spread;
    positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread;
    life[i] = 1;
  }

  function update(dt, size) {
    material.size = size;
    for (let i = 0; i < count; i++) {
      life[i] = Math.max(0, life[i] - dt * 0.6);
      const c = palette[i % palette.length];
      const a = 0.6 * life[i] * life[i];
      colors[i * 3] = c[0] * a;
      colors[i * 3 + 1] = c[1] * a;
      colors[i * 3 + 2] = c[2] * a;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return { object: points, emit, update };
}
