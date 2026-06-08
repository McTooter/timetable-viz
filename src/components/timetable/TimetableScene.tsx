import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { TimetableEntry } from "@/lib/timetable-types";
import { timeToMinutes } from "@/lib/timetable-types";

type Props = {
  entries: TimetableEntry[];
};

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const FIRST_MIN = 8 * 60;
const LAST_MIN = 20 * 60;
const DAY_GAP = 2.6;
const SLAB_WIDTH = 1.8;
const SLAB_DEPTH = 1.4;
const SLAB_GAP = 0.08;

export default function TimetableScene({ entries }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c0b0a");
    scene.fog = new THREE.Fog("#0c0b0a", 22, 80);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    camera.position.set(0, 12, 22);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    // ----- Lights -----
    scene.add(new THREE.AmbientLight(0xfff2dc, 0.35));

    const key = new THREE.DirectionalLight(0xffe0a8, 1.4);
    key.position.set(10, 18, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -20;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8fa9c4, 0.5);
    fill.position.set(-8, 6, 4);
    scene.add(fill);

    // ----- Ground plane -----
    const groundGeo = new THREE.PlaneGeometry(60, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1714,
      roughness: 0.95,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(60, 30, 0x2c2622, 0x1c1815);
    grid.position.y = 0.01;
    scene.add(grid);

    // ----- Day platforms (felt mats with brass screws) -----
    const dayGroup = new THREE.Group();
    scene.add(dayGroup);
    const dayWidth = SLAB_WIDTH * 2 + DAY_GAP;
    const totalDaysWidth = dayWidth * DAYS.length;
    const startX = -totalDaysWidth / 2 + dayWidth / 2;
    const dayPlatforms: THREE.Mesh[] = [];
    for (let i = 0; i < DAYS.length; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x14110f,
        roughness: 0.85,
        metalness: 0.0,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(SLAB_WIDTH * 2 + 0.4, 0.04, SLAB_DEPTH + 0.6),
        mat,
      );
      mesh.position.set(startX + i * dayWidth, 0.02, 0);
      mesh.receiveShadow = true;
      dayGroup.add(mesh);
      dayPlatforms.push(mesh);

      // Four brass screws per platform corner
      const screwMat = new THREE.MeshStandardMaterial({
        color: 0xd8a657,
        metalness: 0.85,
        roughness: 0.3,
        emissive: 0x3a2807,
        emissiveIntensity: 0.4,
      });
      const w = SLAB_WIDTH * 2 + 0.4;
      const d = SLAB_DEPTH + 0.6;
      [
        [-w / 2 + 0.15, -d / 2 + 0.15],
        [w / 2 - 0.15, -d / 2 + 0.15],
        [-w / 2 + 0.15, d / 2 - 0.15],
        [w / 2 - 0.15, d / 2 - 0.15],
      ].forEach(([sx, sz]) => {
        const screw = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12),
          screwMat,
        );
        screw.position.set(startX + i * dayWidth + sx, 0.06, sz);
        screw.castShadow = true;
        dayGroup.add(screw);
      });

      // Day label sprite
      const label = makeTextSprite(DAYS[i].toUpperCase(), "#f5f1e8", 28);
      label.position.set(startX + i * dayWidth, 4.2, 0);
      label.scale.set(4, 1.2, 1);
      dayGroup.add(label);
    }

    // ----- Hour markers along the time axis (z) -----
    const totalMins = LAST_MIN - FIRST_MIN;
    const zRange = 16;
    const zPerMin = zRange / totalMins;
    const hourGroup = new THREE.Group();
    scene.add(hourGroup);
    for (let h = 8; h <= 20; h += 2) {
      const m = (h * 60 - FIRST_MIN) * zPerMin - zRange / 2;
      const lineGeo = new THREE.BoxGeometry(
        SLAB_WIDTH * 2 * DAYS.length + 2,
        0.01,
        0.02,
      );
      const lineMat = new THREE.MeshBasicMaterial({ color: 0x2c2622 });
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.position.set(0, 0.05, m);
      hourGroup.add(line);

      const hourLabel = makeTextSprite(`${h}:00`, "#7a7268", 18);
      hourLabel.position.set(-totalDaysWidth / 2 - 0.8, 0.3, m);
      hourLabel.scale.set(1.4, 0.5, 1);
      hourGroup.add(hourLabel);
    }

    // ----- Class slabs -----
    const slabGroup = new THREE.Group();
    scene.add(slabGroup);
    const slabMap: Map<string, THREE.Mesh> = new Map();

    function clearSlabs() {
      for (const mesh of slabMap.values()) {
        slabGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      slabMap.clear();
    }

    function buildSlabs() {
      clearSlabs();
      const byDay: Record<string, TimetableEntry[]> = {};
      for (const e of entries) {
        (byDay[e.day] ||= []).push(e);
      }
      for (let i = 0; i < DAYS.length; i++) {
        const day = DAYS[i];
        const list = (byDay[day] || []).slice().sort(
          (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
        );
        const xCenter = startX + i * dayWidth;
        for (const e of list) {
          const startM = timeToMinutes(e.startTime);
          const endM = timeToMinutes(e.endTime);
          const zStart = (startM - FIRST_MIN) * zPerMin - zRange / 2;
          const zEnd = (endM - FIRST_MIN) * zPerMin - zRange / 2;
          const length = Math.max(0.3, zEnd - zStart);

          const color = new THREE.Color(e.color || "#d8a657");
          const isPersonal = e.source === "personal";

          const geo = new THREE.BoxGeometry(
            SLAB_WIDTH * 2 - SLAB_GAP * 2,
            isPersonal ? 0.6 : 0.9,
            length - SLAB_GAP,
          );
          const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.45,
            metalness: 0.05,
            emissive: color.clone().multiplyScalar(0.18),
            emissiveIntensity: 1,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(
            xCenter,
            isPersonal ? 0.3 : 0.45,
            (zStart + zEnd) / 2,
          );
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.entry = e;
          slabGroup.add(mesh);
          slabMap.set(e.id, mesh);

          const labelText =
            e.subject.length > 22 ? e.subject.slice(0, 20) + "…" : e.subject;
          const label = makeTextSprite(labelText, "#fbf3df", 22);
          label.position.set(
            xCenter,
            isPersonal ? 1.0 : 1.25,
            (zStart + zEnd) / 2,
          );
          label.scale.set(SLAB_WIDTH * 2 - 0.2, 0.7, 1);
          slabGroup.add(label);

          if (isPersonal) {
            const dot = new THREE.Mesh(
              new THREE.SphereGeometry(0.05, 12, 12),
              new THREE.MeshBasicMaterial({ color: 0xffffff }),
            );
            dot.position.set(
              xCenter + SLAB_WIDTH - 0.1,
              0.6,
              zStart + 0.1,
            );
            slabGroup.add(dot);
          }
        }
      }
    }

    buildSlabs();

    // ----- "Now" cursor -----
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowZ = (nowMin - FIRST_MIN) * zPerMin - zRange / 2;
    const cursor = new THREE.Mesh(
      new THREE.BoxGeometry(SLAB_WIDTH * 2 * DAYS.length + 2, 0.02, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xd8a657 }),
    );
    cursor.position.set(0, 0.07, nowZ);
    scene.add(cursor);

    let angle = 0;
    const target = new THREE.Vector3(0, 0, 0);
    let hoveredEntry: TimetableEntry | null = null;
    let cameraTarget = new THREE.Vector3(0, 14, 22);

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onMove = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };
    renderer.domElement.addEventListener("mousemove", onMove);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      angle += 0.0009;
      if (!hoveredEntry) {
        const r = 24;
        camera.position.x = Math.sin(angle) * r * 0.3;
        camera.position.z = Math.cos(angle) * 0.4 + 22;
        camera.position.y = 12 + Math.sin(angle * 0.5) * 0.6;
        camera.lookAt(target);
      }

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(slabGroup.children, false);
      if (hits.length > 0) {
        const e = hits[0].object.userData.entry as TimetableEntry | undefined;
        if (e && e !== hoveredEntry) {
          hoveredEntry = e;
          const idx = DAYS.indexOf(e.day);
          const xCenter = startX + idx * dayWidth;
          cameraTarget.set(xCenter, 6, hits[0].object.position.z + 4);
        }
      } else if (hoveredEntry) {
        hoveredEntry = null;
        cameraTarget.set(0, 14, 22);
      }
      camera.position.lerp(cameraTarget, 0.05);
      if (hoveredEntry) {
        camera.lookAt(
          target.set(camera.position.x * 0.5, 0, camera.position.z * 0.5),
        );
      }

      const t = (Math.sin(performance.now() * 0.004) + 1) / 2;
      (cursor.material as THREE.MeshBasicMaterial).opacity = 0.6 + t * 0.4;
      (cursor.material as THREE.MeshBasicMaterial).transparent = true;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMove);
      clearSlabs();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [entries]);

  return (
    <div
      ref={mountRef}
      className="relative h-[460px] w-full overflow-hidden rounded-md border border-border bg-[#0c0b0a]"
    >
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-primary" />
        3d · weekly map
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-primary" /> school
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-personal" /> personal
        </span>
      </div>
    </div>
  );
}

function makeTextSprite(
  text: string,
  color: string,
  fontSize: number = 22,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${fontSize}px 'IBM Plex Sans', system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, size / 2, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  return sprite;
}
