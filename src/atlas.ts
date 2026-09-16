import "./atlas.css";
export interface Place {
  id: string;
  name: string;
  parcel: string;
  point: [number, number];
  category: string;
  status: string;
  note: string;
  source: string;
  color: string;
  number: number;
  polygon?: [number, number][];
}
export interface Road {
  id: string;
  name: string;
  kind: string;
  points: [number, number][];
}
export interface AtlasData {
  places: Place[];
  roads: Road[];
  categories: Record<string, string>;
  land: [number, number][];
  metresPerPixel: number;
  unplaced: string[];
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const svg = document.getElementById("atlas") as unknown as SVGSVGElement;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let data: AtlasData,
  selected = "uestc",
  compared = "bupt",
  category = "全部",
  query = "",
  view = "map",
  underlay = false;
let box = [185, 485, 610, 580];
let model:
    | Awaited<ReturnType<(typeof import("./overall3d"))["createOverall"]>>
    | undefined,
  modelPromise: Promise<void> | undefined;
const major = new Set([
  "uestc",
  "bupt",
  "cuc",
  "library",
  "sports",
  "minzu",
  "blcu",
  "dorm3",
  "geology",
  "community",
  "teaching",
]);
const find = (id: string) => data.places.find((p) => p.id === id)!;
function distance(a: Place, b: Place) {
  return (
    Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1]) *
    data.metresPerPixel
  );
}
function rounded(n: number) {
  return Math.max(50, Math.round(n / 50) * 50);
}
function direction(a: Place, b: Place) {
  const angle =
    ((Math.atan2(b.point[0] - a.point[0], a.point[1] - b.point[1]) * 180) /
      Math.PI +
      360) %
    360;
  return ["北", "东北", "东", "东南", "南", "西南", "西", "西北"][
    Math.round(angle / 45) % 8
  ];
}
function filtered() {
  return data.places.filter(
    (p) =>
      (category === "全部" || p.category === category) &&
      (!query ||
        (p.name + p.parcel + p.category)
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
}
function updateBox() {
  svg.setAttribute("viewBox", box.join(" "));
  const m = 500 / data.metresPerPixel;
  const pixelPerUnit = svg.clientWidth / box[2];
  $("scale").textContent =
    view === "map"
      ? `图面估算 · 500m ≈ ${Math.round(m * pixelPerUnit)}px`
      : "地块体块示意 · 不用于量测";
  drawMap();
}
function zoom(f: number) {
  box = [
    box[0] + (box[2] * (1 - f)) / 2,
    box[1] + (box[3] * (1 - f)) / 2,
    Math.max(170, Math.min(1600, box[2] * f)),
    Math.max(160, Math.min(1700, box[3] * f)),
  ];
  updateBox();
}
function renderList() {
  const parent = $("place-list");
  parent.replaceChildren();
  for (const p of filtered()) {
    const b = document.createElement("button");
    b.className = "place-row" + (p.id === selected ? " active" : "");
    b.setAttribute("aria-pressed", String(p.id === selected));
    b.style.setProperty("--pin", p.color);
    b.innerHTML = `<span class="place-number">${p.number}</span><span class="place-text">${esc(p.name)}<small>${esc(p.parcel)} · ${esc(p.status)}</small></span>`;
    b.onclick = () => select(p.id, true);
    parent.append(b);
  }
  if (!parent.children.length)
    parent.textContent = "没有匹配地点；可查看尚未定位的项目。";
}
function segment(p: number[], a: number[], b: number[]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function renderInspector() {
  const a = find(selected),
    b = find(compared);
  $("selected-code").textContent = a.parcel;
  $("selected-name").textContent = a.name;
  $("selected-category").textContent = a.category;
  $("selected-status").textContent = a.status;
  $("selected-note").textContent = a.note;
  $<HTMLAnchorElement>("selected-source").href = a.source;
  $("walk-link").hidden = false;
  $<HTMLAnchorElement>("walk-link").href =
    `./world.html?place=${encodeURIComponent(a.id)}`;
  const selectEl = $<HTMLSelectElement>("compare-place");
  selectEl.replaceChildren();
  for (const p of data.places) {
    if (p.id === a.id) continue;
    const o = new Option(`${p.name} · ${p.parcel}`, p.id);
    selectEl.add(o);
  }
  selectEl.value = compared;
  const dir = direction(a, b),
    d = rounded(distance(a, b));
  $("direction").textContent = dir + "侧";
  $("distance").textContent = `约${d}m`;
  $("relation-sentence").textContent =
    `${b.name}在${a.name}的${dir}侧，地块中心直线相距约${d}米。`;
  const nearby = $("nearby");
  nearby.replaceChildren();
  for (const p of data.places
    .filter((p) => p.id !== selected)
    .sort((x, y) => distance(a, x) - distance(a, y))
    .slice(0, 4)) {
    const button = document.createElement("button");
    button.className = "near-row";
    button.innerHTML = `<span>${esc(p.name)}</span><small>${direction(a, p)} · ${rounded(distance(a, p))}m</small>`;
    button.onclick = () => {
      compared = p.id;
      renderInspector();
      drawMap();
      model?.select(selected, compared);
    };
    nearby.append(button);
  }
  const nearRoads = data.roads
    .map((r) => ({
      r,
      d: Math.min(
        ...r.points.slice(1).map((p, i) => segment(a.point, r.points[i], p)),
      ),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);
  $("near-roads").replaceChildren();
  for (const { r } of nearRoads) {
    const span = document.createElement("span");
    span.textContent = r.name;
    $("near-roads").append(span);
  }
}
function select(id: string, focus = false) {
  selected = id;
  if (compared === id) compared = id === "uestc" ? "bupt" : "uestc";
  renderList();
  renderInspector();
  drawMap();
  model?.select(selected, compared);
  if (focus && view === "map") {
    const p = find(id);
    if (
      p.point[0] < box[0] + 20 ||
      p.point[0] > box[0] + box[2] - 20 ||
      p.point[1] < box[1] + 20 ||
      p.point[1] > box[1] + box[3] - 20
    ) {
      box = [p.point[0] - box[2] / 2, p.point[1] - box[3] / 2, box[2], box[3]];
      updateBox();
    }
  }
}
function drawMap() {
  if (!data) return;
  const unit = Math.max(
    1,
    1 / Math.min(svg.clientWidth / box[2], svg.clientHeight / box[3]),
  );
  const a = find(selected),
    b = find(compared);
  const poly = (p: number[][]) => p.map((v) => v.join(",")).join(" ");
  const d = (p: number[][]) => "M" + p.map((v) => v.join(",")).join(" L");
  let out = `<rect x="-1000" y="-1000" width="4000" height="4000" fill="#dcece6"/><rect x="0" y="0" width="990" height="1400" fill="url(#grid)"/><path d="${d(data.land)} Z" fill="#edf1df" stroke="#b5cdb5" stroke-width="1.3"/><path d="M570 1120 Q650 1020 825 1080 T1080 1240 L1100 1400 L480 1400 Z" fill="#c6d9ba" opacity=".7"/><path d="M795 350 Q910 360 881 530 Q825 552 850 614 Q940 655 891 738 Q833 782 817 755 Q798 695 807 662 Q763 598 784 542 Z" fill="#c5e0e3" opacity=".85"/>`;
  if (underlay)
    out += `<image href="./overall/parcels.png" x="0" y="0" width="990" height="1400" opacity=".85"/>`;
  out +=
    '<text x="320" y="665" fill="#5c8b83" font-size="24" letter-spacing="12">新村港</text><text x="841" y="617" fill="#618b8b" font-size="16" writing-mode="vertical-rl" letter-spacing="5">山牛港</text><text x="690" y="980" fill="#89a080" font-size="14" letter-spacing="6">牛由山</text><text x="675" y="1180" fill="#5c8b83" font-size="20" letter-spacing="12">南海</text>';
  for (const p of data.places) {
    if (!p.polygon) continue;
    const active = p.id === selected;
    out += `<polygon points="${poly(p.polygon)}" fill="${p.color}" fill-opacity="${active ? 0.55 : 0.2}" stroke="${active ? "#d07840" : p.color}" stroke-opacity=".75" stroke-width="${active ? 2 : 0.75}"/>`;
  }
  for (const r of data.roads) {
    const main = r.kind === "对外道路";
    out += `<path d="${d(r.points)}" fill="none" stroke="#fafcf4" stroke-width="${main ? 8 : 5}" stroke-linejoin="round"/><path d="${d(r.points)}" fill="none" stroke="${main ? "#97b495" : "#bdcdb5"}" stroke-width="${main ? 3 : 1.4}" stroke-linejoin="round"/>`;
  }
  if (box[2] < 900) {
    for (const r of data.roads.filter((r) =>
      [
        "coast",
        "middle",
        "inland",
        "south",
        "east",
        "cross9",
        "cross6",
      ].includes(r.id),
    )) {
      const mid = r.points[Math.floor(r.points.length / 2)];
      out += `<text x="${mid[0] + 7}" y="${mid[1] + 14}" class="road-label">${esc(r.name.split(" · ")[0])}</text>`;
    }
  }
  out += `<path d="M${a.point.join(",")} L${b.point.join(",")}" fill="none" stroke="#c9733c" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#arrow)"/><circle cx="${a.point[0]}" cy="${a.point[1]}" r="13" fill="none" stroke="#c9733c" stroke-width="1.5"/>`;
  const visible = filtered();
  const occupied: number[][] = [];
  const labelMap = new Map<string, [number, number]>();
  for (const p of [...visible].sort(
    (x, y) =>
      Number(y.id === selected || y.id === compared) -
        Number(x.id === selected || x.id === compared) ||
      Number(major.has(y.id)) - Number(major.has(x.id)),
  )) {
    if (
      !(
        major.has(p.id) ||
        p.id === selected ||
        p.id === compared ||
        box[2] < 330
      )
    )
      continue;
    const width = p.name.length * 10 * unit;
    for (const [ox, oy] of [
      [12 * unit, -7 * unit],
      [12 * unit, 16 * unit],
      [-width - 12 * unit, -7 * unit],
      [-width - 12 * unit, 16 * unit],
      [12 * unit, -21 * unit],
    ]) {
      const r = [p.point[0] + ox, p.point[1] + oy - 10, width, 12];
      if (
        occupied.some(
          (q) =>
            r[0] < q[0] + q[2] + 5 &&
            r[0] + r[2] + 5 > q[0] &&
            r[1] < q[1] + q[3] + 3 &&
            r[1] + r[3] + 3 > q[1],
        )
      )
        continue;
      occupied.push(r);
      labelMap.set(p.id, [ox, oy]);
      break;
    }
  }
  for (const p of visible) {
    const active = p.id === selected,
      other = p.id === compared;
    const label = labelMap.get(p.id);
    out += `<g class="poi" data-place="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name + " " + p.parcel)}" aria-pressed="${active}"><title>${esc(p.name + " · " + p.parcel + " · " + p.status)}</title><circle cx="${p.point[0]}" cy="${p.point[1]}" r="${(active ? 8 : 6.7) * unit}" fill="${active ? "#173e39" : other ? "#c9733c" : p.color}" stroke="#fff" stroke-width="1.4"/><text x="${p.point[0]}" y="${p.point[1] + 2.4 * unit}" text-anchor="middle" font-size="${6.8 * unit}" fill="white">${p.number}</text>${label ? `<text x="${p.point[0] + label[0]}" y="${p.point[1] + label[1]}" class="map-name" style="font-size:${10 * unit}px">${esc(p.name)}</text>` : ""}</g>`;
  }
  $("map-content").innerHTML = out;
  svg.querySelectorAll<SVGGElement>("[data-place]").forEach((g) => {
    g.addEventListener("click", () => select(g.dataset.place!));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(g.dataset.place!);
        svg.querySelector<SVGGElement>(`[data-place="${selected}"]`)?.focus();
      }
    });
  });
}
async function setView(next: string) {
  if (next === "3d") {
    location.href = `./world.html?place=${encodeURIComponent(selected)}`;
    return;
  }
  view = next;
  updateBox();
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === next);
    b.setAttribute("aria-pressed", String(b.dataset.view === next));
  });
  $("region").hidden = next !== "region";
  $("map-wrap").hidden = next === "region";
  $("north").hidden = next !== "map";
  $("map-tools").hidden = next !== "map";
  svg.style.display = next === "map" ? "block" : "none";
  $("world").hidden = next !== "3d";
  $("three-labels").hidden = next !== "3d";
  $("map-title").textContent = next === "3d" ? "地块立体关系" : "校园位置关系";
  $("map-kicker").textContent =
    next === "3d" ? "一期 · 薄板表示地块，不是建筑" : "一期 · 北向朝上";
  $("map-hint").textContent =
    next === "3d"
      ? "拖动旋转 · 滚轮缩放 · 点击地块选择"
      : "拖动平移 · 滚轮缩放 · 点击标记选址";
  if (next === "3d") {
    if (!modelPromise)
      modelPromise = import("./overall3d").then(async (m) => {
        model = await m.createOverall(
          $<HTMLCanvasElement>("world"),
          $("three-labels"),
          data,
          (id) => select(id),
        );
        model.select(selected, compared);
        model.setVisible(view === "3d");
      });
    await modelPromise;
    model?.setVisible(view === "3d");
  } else model?.setVisible(false);
}
async function boot() {
  const r = await fetch("./overall/data.json");
  if (!r.ok) throw Error("总图数据加载失败");
  data = await r.json();
  $("place-count").textContent = String(data.places.length);
  for (const c of ["全部", ...Object.keys(data.categories)]) {
    const b = document.createElement("button");
    b.textContent = c;
    b.className = c === category ? "active" : "";
    b.setAttribute("aria-pressed", String(c === category));
    b.onclick = () => {
      category = c;
      document
        .querySelectorAll<HTMLButtonElement>("#filters button")
        .forEach((x) => {
          x.classList.toggle("active", x === b);
          x.setAttribute("aria-pressed", String(x === b));
        });
      renderList();
      drawMap();
    };
    $("filters").append(b);
  }
  for (const text of data.unplaced) {
    const li = document.createElement("li");
    li.textContent = text;
    $("unplaced-list").append(li);
  }
  $("search").addEventListener("input", (e) => {
    query = (e.target as HTMLInputElement).value.trim();
    renderList();
    drawMap();
  });
  $("compare-place").addEventListener("change", (e) => {
    compared = (e.target as HTMLSelectElement).value;
    renderInspector();
    drawMap();
    model?.select(selected, compared);
  });
  $("fit-pair").onclick = () => {
    setView("map");
    const a = find(selected).point,
      b = find(compared).point,
      w = Math.max(190, Math.abs(a[0] - b[0]) + 140),
      h = Math.max(190, Math.abs(a[1] - b[1]) + 140);
    box = [(a[0] + b[0]) / 2 - w / 2, (a[1] + b[1]) / 2 - h / 2, w, h];
    updateBox();
  };
  $("zoom-in").onclick = () => zoom(0.8);
  $("zoom-out").onclick = () => zoom(1.25);
  $("reset-map").onclick = () => {
    box = [185, 485, 610, 580];
    updateBox();
  };
  $("full-map").onclick = () => {
    box = [100, 175, 780, 1030];
    updateBox();
  };
  $("underlay").onclick = () => {
    underlay = !underlay;
    $("underlay").classList.toggle("active", underlay);
    $("underlay").setAttribute("aria-pressed", String(underlay));
    drawMap();
  };
  document
    .querySelectorAll<HTMLButtonElement>("[data-view]")
    .forEach(
      (b) => (b.onclick = () => setView(b.dataset.view!).catch(showError)),
    );
  $("back-phase1").onclick = () => setView("map");
  $("source-open").onclick = () => $<HTMLDialogElement>("sources").showModal();
  $("source-open-mobile").onclick = () =>
    $<HTMLDialogElement>("sources").showModal();
  $("source-close").onclick = () => $<HTMLDialogElement>("sources").close();
  let drag: { x: number; y: number; box: number[] } | null = null;
  svg.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest(".poi")) return;
    drag = { x: e.clientX, y: e.clientY, box: [...box] };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / drag.box[2], rect.height / drag.box[3]);
    box = [
      drag.box[0] - (e.clientX - drag.x) / scale,
      drag.box[1] - (e.clientY - drag.y) / scale,
      drag.box[2],
      drag.box[3],
    ];
    updateBox();
  });
  svg.addEventListener("pointerup", () => (drag = null));
  svg.addEventListener("pointercancel", () => (drag = null));
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.1 : 0.9);
    },
    { passive: false },
  );
  window.addEventListener("resize", () => updateBox());
  select(selected);
  updateBox();
  if (import.meta.env.DEV)
    (window as any).atlasDebug = {
      data,
      getState: () => ({ selected, compared, view, box, underlay }),
      distance: (a: string, b: string) => distance(find(a), find(b)),
    };
}
function showError(e: unknown) {
  $("error").hidden = false;
  $("error").textContent = String(e);
}
boot().catch(showError);
