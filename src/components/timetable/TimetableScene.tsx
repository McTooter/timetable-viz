import { useEffect, useRef, useState } from "react";
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
] as const;

const FIRST_MIN = 8 * 60;
const LAST_MIN = 20 * 60;
const SPAN = LAST_MIN - FIRST_MIN; // 720 minutes

export default function TimetableScene({ entries }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    subject: string;
    time: string;
    location?: string;
    source: string;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#08070a");
    scene.fog = new THREE.FogExp2("#08070a", 0.014);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500);
    camera.position.set(0, 14, 32);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    // ─── lighting ───────────────────────────────────────────────
    scene.add(new THREE.HemisphereLight(0xb6a8a0, 0x14110f, 0.45));

    const keyLight = new THREE.DirectionalLight(0xffe8b8, 1.2);
    keyLight.position.set(12, 22, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -28;
    keyLight.shadow.camera.right = 28;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -22;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 60;
    keyLight.shadow.bias = -0.0003;
    scene.add(keyLight);

    const rim = new THREE.DirectionalLight(0x6f8aa6, 0.4);
    rim.position.set(-10, 8, -8);
    scene.add(rim);

    // ─── ground: a polished obsidian floor with reflections ────
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0a0908,
        metalness: 0.6,
        roughness: 0.25,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Concentric brass rings on the floor — radial time markers
    for (let i = 1; i <= 5; i++) {
      const r = i * 4;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.02, r + 0.02, 96),
        new THREE.MeshBasicMaterial({
          color: 0x6b5326,
          transparent: true,
          opacity: 0.4 - i * 0.05,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      scene.add(ring);
    }

    // ─── the great clock face at the back ──────────────────────
    const clockRadius = 11;
    const clockGroup = new THREE.Group();
    clockGroup.position.set(0, 9, -22);
    scene.add(clockGroup);

    // outer ring
    const clockFace = new THREE.Mesh(
      new THREE.CylinderGeometry(clockRadius, clockRadius, 0.3, 64, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x1a1614,
        metalness: 0.7,
        roughness: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    clockFace.rotation.x = Math.PI / 2;
    clockGroup.add(clockFace);

    // inner brass disc
    const clockInner = new THREE.Mesh(
      new THREE.CircleGeometry(clockRadius - 0.5, 64),
      new THREE.MeshStandardMaterial({
        color: 0x1f1815,
        metalness: 0.5,
        roughness: 0.6,
      }),
    );
    clockGroup.add(clockInner);

    // brass hour ticks
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 1.4, 0.05),
        new THREE.MeshStandardMaterial({
          color: 0xd8a657,
          metalness: 0.9,
          roughness: 0.25,
          emissive: 0x3a2807,
          emissiveIntensity: 0.4,
        }),
      );
      tick.position.set(
        Math.sin(a) * (clockRadius - 1),
        Math.cos(a) * (clockRadius - 1),
        0.2,
      );
      tick.rotation.z = -a;
      clockGroup.add(tick);
    }

    // 8–20 work-window arc — a thicker brass band
    const arcStart = (8 / 24) * Math.PI * 2;
    const arcEnd = (20 / 24) * Math.PI * 2;
    const arcPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const a = arcStart + (arcEnd - arcStart) * t;
      arcPoints.push(
        new THREE.Vector3(
          Math.sin(a) * (clockRadius - 0.6),
          Math.cos(a) * (clockRadius - 0.6),
          0.25,
        ),
      );
    }
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
    const arcMat = new THREE.LineBasicMaterial({ color: 0xd8a657 });
    clockGroup.add(new THREE.Line(arcGeo, arcMat));

    // hour + minute hands
    const now = new Date();
    const hourAngle =
      ((now.getHours() % 12) / 12) * Math.PI * 2 +
      (now.getMinutes() / 60) * (Math.PI / 6);
    const hourHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 5, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x2a2018,
        metalness: 0.6,
        roughness: 0.5,
      }),
    );
    hourHand.position.set(0, 0, 0.35);
    hourHand.geometry.translate(0, 2.5, 0);
    hourHand.rotation.z = -hourAngle;
    clockGroup.add(hourHand);

    const minHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 7.5, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0xd8a657,
        metalness: 0.9,
        roughness: 0.25,
        emissive: 0x3a2807,
        emissiveIntensity: 0.5,
      }),
    );
    minHand.position.set(0, 0, 0.5);
    minHand.geometry.translate(0, 3.75, 0);
    minHand.rotation.z =
      -((now.getMinutes() / 60) * Math.PI * 2) + Math.PI * 2;
    clockGroup.add(minHand);

    // center cap
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xd8a657,
        metalness: 0.95,
        roughness: 0.15,
      }),
    );
    cap.position.z = 0.5;
    clockGroup.add(cap);

    // ─── day pavilions ─────────────────────────────────────────
    const DAY_GAP = 5.5;
    const PAVILION_W = 4.2;
    const PAVILION_D = 4.2;
    const totalWidth = DAY_GAP * DAYS.length;
    const startX = -totalWidth / 2 + DAY_GAP / 2;
    const dayData: {
      group: THREE.Group;
      letter: THREE.Mesh;
      label: THREE.Sprite;
    }[] = [];

    const brass = new THREE.MeshStandardMaterial({
      color: 0xd8a657,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x2a1d05,
      emissiveIntensity: 0.3,
    });
    const stone = new THREE.MeshStandardMaterial({
      color: 0x1f1b18,
      metalness: 0.2,
      roughness: 0.7,
    });
    const obsidian = new THREE.MeshStandardMaterial({
      color: 0x0e0c0b,
      metalness: 0.7,
      roughness: 0.2,
    });

    for (let i = 0; i < DAYS.length; i++) {
      const grp = new THREE.Group();
      grp.position.x = startX + i * DAY_GAP;
      scene.add(grp);

      // stone plinth
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(PAVILION_W, 0.35, PAVILION_D),
        stone,
      );
      plinth.position.y = 0.175;
      plinth.receiveShadow = true;
      plinth.castShadow = true;
      grp.add(plinth);

      // brass strip around the top of the plinth
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(PAVILION_W + 0.1, 0.04, PAVILION_D + 0.1),
        brass,
      );
      trim.position.y = 0.37;
      grp.add(trim);

      // four brass corner posts
      const postH = 3.4;
      const postR = 0.12;
      [
        [-PAVILION_W / 2 + 0.2, -PAVILION_D / 2 + 0.2],
        [PAVILION_W / 2 - 0.2, -PAVILION_D / 2 + 0.2],
        [-PAVILION_W / 2 + 0.2, PAVILION_D / 2 - 0.2],
        [PAVILION_W / 2 - 0.2, PAVILION_D / 2 - 0.2],
      ].forEach(([px, pz]) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(postR, postR, postH, 16),
          brass,
        );
        post.position.set(px, 0.37 + postH / 2, pz);
        post.castShadow = true;
        grp.add(post);
      });

      // day-letter monolith in the center of the pavilion
      const letterCanvas = document.createElement("canvas");
      letterCanvas.width = 256;
      letterCanvas.height = 256;
      const lctx = letterCanvas.getContext("2d")!;
      lctx.fillStyle = "#d8a657";
      lctx.fillRect(0, 0, 256, 256);
      lctx.fillStyle = "#0a0908";
      lctx.font = "bold 180px 'Big Shoulders Display', Impact, sans-serif";
      lctx.textAlign = "center";
      lctx.textBaseline = "middle";
      lctx.fillText(DAYS[i].slice(0, 1), 128, 138);
      const letterTex = new THREE.CanvasTexture(letterCanvas);
      const letter = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.6, 0.3),
        new THREE.MeshStandardMaterial({ map: letterTex, metalness: 0.6, roughness: 0.3 }),
      );
      letter.position.y = 0.37 + 1.6 / 2 + 0.4;
      letter.castShadow = true;
      grp.add(letter);

      // day label sprite (full name) hovering above
      const label = makeTextSprite(
        DAYS[i].toUpperCase(),
        "#f5e9c8",
        "IBM Plex Sans",
        22,
      );
      label.position.set(0, postH + 1.4, 0);
      label.scale.set(4.2, 1.0, 1);
      grp.add(label);

      // dark glass floor inside the pavilion (so subject hourglasses "stand on" it)
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(PAVILION_W - 0.6, 0.04, PAVILION_D - 0.6),
        obsidian,
      );
      glass.position.y = 0.41;
      glass.receiveShadow = true;
      grp.add(glass);

      // a thin red "now" lane for today's pavilion (mark today at render-time)
      // — we just keep the data; we'll color the floor at draw time below
      grp.userData = { dayIndex: i, day: DAYS[i] };

      // floating day nameplate at front
      const namePlate = makeTextSprite(
        DAYS[i].slice(0, 3).toUpperCase(),
        "#d8a657",
        "Big Shoulders Display",
        36,
      );
      namePlate.position.set(0, 0.55, PAVILION_D / 2 + 0.05);
      namePlate.scale.set(2.4, 0.8, 1);
      grp.add(namePlate);

      dayData.push({ group: grp, letter, label });
    }

    // ─── the "today" pavilion gets a red interior glow ────────
    const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0
    const todayGroup = dayData[todayIdx].group;
    const todayLight = new THREE.PointLight(0xd8a657, 0.8, 4);
    todayLight.position.set(0, 2.5, 0);
    todayGroup.add(todayLight);

    // ─── particle dust motes ────────────────────────────────────
    const dustCount = 400;
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * 60;
      dustPos[i * 3 + 1] = Math.random() * 14;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xd8a657,
      size: 0.04,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    // ─── class hourglasses ──────────────────────────────────────
    const hourglassGroup = new THREE.Group();
    scene.add(hourglassGroup);
    const hourglassMeshes: {
      mesh: THREE.Group;
      entry: TimetableEntry;
    }[] = [];

    function clearHourglasses() {
      while (hourglassGroup.children.length) {
        const c = hourglassGroup.children[0];
        hourglassGroup.remove(c);
        c.traverse((o) => {
          if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
          if ((o as THREE.Mesh).material) {
            const m = (o as THREE.Mesh).material;
            if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
            else m.dispose();
          }
        });
      }
      hourglassMeshes.length = 0;
    }

    function buildHourglass(entry: TimetableEntry) {
      const dayIdx = DAYS.indexOf(entry.day as (typeof DAYS)[number]);
      if (dayIdx < 0) return;
      const startM = timeToMinutes(entry.startTime);
      const endM = timeToMinutes(entry.endTime);
      const zStart = ((startM - FIRST_MIN) / SPAN) * 22 - 11;
      const zEnd = ((endM - FIRST_MIN) / SPAN) * 22 - 11;
      const zMid = (zStart + zEnd) / 2;
      const xCenter = startX + dayIdx * DAY_GAP;
      const isPersonal = entry.source === "personal";
      const color = new THREE.Color(entry.color || "#d8a657");

      const grp = new THREE.Group();
      grp.position.set(xCenter, 0.4, zMid);
      grp.userData.entry = entry;

      // brass base disc
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0xd8a657,
        metalness: 0.95,
        roughness: 0.2,
        emissive: 0x2a1d05,
        emissiveIntensity: 0.4,
      });
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 0.08, 32),
        baseMat,
      );
      base.position.y = 0;
      base.castShadow = true;
      base.receiveShadow = true;
      grp.add(base);

      // glass top + bottom cones
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: color,
        metalness: 0.0,
        roughness: 0.05,
        transmission: 0.85,
        thickness: 0.5,
        ior: 1.5,
        emissive: color,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.7,
      });
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 1.0, 24, 1, true),
        glassMat,
      );
      top.position.y = 0.55;
      top.castShadow = true;
      grp.add(top);

      const bottom = new THREE.Mesh(
        new THREE.ConeGeometry(0.7, 1.2, 24, 1, true),
        glassMat,
      );
      bottom.position.y = 1.65;
      bottom.rotation.x = Math.PI;
      bottom.castShadow = true;
      grp.add(bottom);

      // subject plaque floating above
      const plaque = makePlaque(entry.subject, color);
      plaque.position.y = 3.1;
      grp.add(plaque);

      // small timecode underneath the base
      const timecode = makeTextSprite(
        `${entry.startTime}–${entry.endTime}`,
        "#a89b7e",
        "JetBrains Mono",
        16,
      );
      timecode.position.set(0, -0.1, 1.1);
      timecode.scale.set(1.4, 0.45, 1);
      grp.add(timecode);

      grp.scale.setScalar(isPersonal ? 0.85 : 1);
      hourglassGroup.add(grp);
      hourglassMeshes.push({ mesh: grp, entry });
    }

    for (const e of entries) {
      buildHourglass(e);
    }

    // ─── the "now" laser ────────────────────────────────────────
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowZ = ((nowMin - FIRST_MIN) / SPAN) * 22 - 11;
    const laserGeo = new THREE.BoxGeometry(totalWidth + 4, 0.04, 0.06);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xc46a4a,
      transparent: true,
      opacity: 0.85,
    });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.set(0, 0.5, nowZ);
    scene.add(laser);

    // laser glow halo
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(totalWidth + 4, 0.6),
      new THREE.MeshBasicMaterial({
        color: 0xc46a4a,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(0, 0.52, nowZ);
    scene.add(halo);

    // ─── camera control ─────────────────────────────────────────
    let angle = 0;
    let hovered: TimetableEntry | null = null;
    const camTarget = new THREE.Vector3(0, 14, 32);
    const camPos = new THREE.Vector3(0, 14, 32);

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // raycast for hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onMove = (ev: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };
    renderer.domElement.addEventListener("mousemove", onMove);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;

      // slow camera orbit (slower than before)
      angle += 0.0004;
      if (!hovered) {
        const r = 32;
        camPos.x = Math.sin(angle) * r * 0.3;
        camPos.z = Math.cos(angle) * 0.4 + r;
        camPos.y = 14 + Math.sin(angle * 0.5) * 0.5;
      }
      camPos.lerp(camTarget, 0.04);
      camera.position.copy(camPos);
      camera.lookAt(0, 4, 0);

      // rotate hourglasses gently; personal ones spin faster
      for (const h of hourglassMeshes) {
        const speed = h.entry.source === "personal" ? 0.008 : 0.002;
        h.mesh.rotation.y += speed;
      }

      // dust drift
      const dpos = dust.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < dustCount; i++) {
        dpos.array[i * 3 + 1] += 0.003;
        if (dpos.array[i * 3 + 1] > 14) dpos.array[i * 3 + 1] = 0;
      }
      dpos.needsUpdate = true;

      // laser pulse
      laserMat.opacity = 0.7 + Math.sin(t * 3) * 0.2;
      (halo.material as THREE.MeshBasicMaterial).opacity =
        0.14 + Math.sin(t * 3) * 0.06;

      // hour hand ticks
      const ms = Date.now() / 1000;
      const mAngle = ((ms / 60) % 1) * (Math.PI * 2);
      minHand.rotation.z = -mAngle;

      // raycast for hover (hourglasses first)
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(hourglassGroup.children, true);
      if (hits.length > 0) {
        // walk up to find the userData.entry
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !(obj as any).userData?.entry) obj = obj.parent;
        const e = obj?.userData?.entry as TimetableEntry | undefined;
        if (e && e !== hovered) {
          hovered = e;
          const idx = DAYS.indexOf(e.day as (typeof DAYS)[number]);
          const xCenter = startX + idx * DAY_GAP;
          camTarget.set(xCenter * 0.6, 6, hits[0].object.position.z + 6);
          setHoverInfo({
            subject: e.subject,
            time: `${e.startTime}–${e.endTime}`,
            location: e.location,
            source: e.source,
          });
          renderer.domElement.style.cursor = "pointer";
        }
      } else {
        if (hovered) {
          hovered = null;
          camTarget.set(0, 14, 32);
          setHoverInfo(null);
          renderer.domElement.style.cursor = "default";
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("mousemove", onMove);
      clearHourglasses();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [entries]);

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-md border border-border bg-[#08070a]">
      <div
        ref={mountRef}
        className="absolute inset-0"
      />
      {/* HUD overlay */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-primary">
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
        live · weekly map
      </div>
      {hoverInfo && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 max-w-xs rounded-sm border border-border bg-card/90 px-4 py-3 backdrop-blur">
          <div className="font-display text-lg font-bold uppercase tracking-wider text-foreground">
            {hoverInfo.subject}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {hoverInfo.time}
            {hoverInfo.location ? ` · ${hoverInfo.location}` : ""}
          </div>
          <div
            className={`mt-1 font-mono text-[9px] uppercase tracking-widest ${
              hoverInfo.source === "personal" ? "text-personal" : "text-primary"
            }`}
          >
            ▸ {hoverInfo.source}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 right-4 z-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        drag · hover · explore
      </div>
    </div>
  );
}

function makeTextSprite(
  text: string,
  color: string,
  font: string,
  size: number,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const w = 512;
  const h = 128;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.font = `bold ${size}px '${font}', sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // soft glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0;
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true }),
  );
  return sprite;
}

function makePlaque(label: string, color: THREE.Color): THREE.Group {
  const grp = new THREE.Group();
  const trimmed = label.length > 18 ? label.slice(0, 16) + "…" : label;

  // brass plate
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.5, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0xd8a657,
      metalness: 0.95,
      roughness: 0.18,
      emissive: 0x2a1d05,
      emissiveIntensity: 0.4,
    }),
  );
  grp.add(plate);

  // engraved text
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#d8a657";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#1a1208";
  ctx.font = "bold 56px 'Big Shoulders Display', Impact, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(trimmed.toUpperCase(), 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const text = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 0.45),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  text.position.z = 0.03;
  grp.add(text);

  // tiny accent dot for personal
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  dot.position.set(1.05, 0, 0.06);
  grp.add(dot);

  return grp;
}
