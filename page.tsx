"use client";

import type { MouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type ShapeType = "triangle" | "rectangle" | "regular" | "rhombus" | "trapezoid" | "parallelogram" | "circle";
type TriangleMode = "scalene" | "right" | "obtuse" | "acute" | "isosceles";
type TrapezoidMode = "normal" | "isosceles" | "right";
type CircleTool = "radius" | "diameter" | "chord" | "chordAltitude" | "tangentAltitude";
type SceneKey = "shape" | "axes" | "mechanics";
type Panel = SceneKey | "style";
type Point = { id: string; x: number; y: number; label: string; kind: "vertex" | "foot" | "intersection" | "manual" | "free" | "axes" };
type Edge = { a: number; b: number };
type CircleShape = { center: number; radiusPoint: number; radius: number };
type Geometry = { points: Omit<Point, "label" | "kind">[]; edges: Edge[]; circle?: CircleShape; error?: string };
type LineTarget = { id: string; kind: "edge" | "diagonal"; index: number; a: number; b: number; label: string };
type Diagonal = { id: string; a: number; b: number; label: string; dashed?: boolean };
type Altitude = {
  id: string;
  source: number;
  targetId: string;
  footLabel: string;
  mode: "internal" | "external";
  altitudeLabel: string;
  footToStartLabel: string;
  footToEndLabel: string;
  dashed?: boolean;
};
type AngleMark = { id: string; a: string; b: string; c: string; value: string };
type Shading = { id: string; pointIds: string[]; style: "light" | "dark" | "hatch" };
type CircleConstruction = {
  id: string;
  type: CircleTool;
  a: number;
  b: number;
  label: string;
  footLabel: string;
  dashed?: boolean;
};
type ManualPoint = { id: string; segmentId: string; t: number; label: string };
type FreePoint = { id: string; x: number; y: number; label: string; source: "canvas" | "axes" };
type CustomConnection = { id: string; a: string; b: string; label: string; dashed: boolean };
type FloatingText = { id: string; x: number; y: number; text: string; size: number; scene: SceneKey };
type AxesPoint = { id: string; label: string; x: string; y: string };
type AxesSegment = { id: string; a: string; b: string; label: string; dashed: boolean };
type FunctionGraph = { id: string; expression: string; from: string; to: string; dashed: boolean };
type MechanicElement = {
  id: string;
  type: "force" | "couple" | "block" | "plane" | "pulley" | "ladder";
  x: number;
  y: number;
  label: string;
  angle: string;
  dashed: boolean;
};
type ResolvedSegment = { id: string; start: Point; end: Point; label: string; dashed?: boolean };
type Notice = { type: "ok" | "error"; text: string } | null;

const ARABIC_DIGITS: Record<string, string> = {
  "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤",
  "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩",
};

const SYMBOLS = [
  { key: "alef", ordinary: "أ", glyph: "𞸀", name: "ألف" },
  { key: "beh", ordinary: "ب", glyph: "ب", name: "باء" },
  { key: "jeem", ordinary: "ج", glyph: "𞸢", name: "جيم" },
  { key: "dal", ordinary: "د", glyph: "د", name: "دال" },
  { key: "heh", ordinary: "هـ", glyph: "𞸤", name: "هاء" },
  { key: "waw", ordinary: "و", glyph: "و", name: "واو" },
  { key: "zain", ordinary: "ز", glyph: "ز", name: "زاي" },
  { key: "hah", ordinary: "ح", glyph: "𞸧", name: "حاء" },
  { key: "khah", ordinary: "خ", glyph: "𞸷", name: "خاء" },
  { key: "tah", ordinary: "ط", glyph: "ط", name: "طاء" },
  { key: "yeh", ordinary: "ي", glyph: "ي", name: "ياء" },
  { key: "kaf", ordinary: "ك", glyph: "ك", name: "كاف" },
  { key: "seen", ordinary: "س", glyph: "س", name: "سين" },
  { key: "sad", ordinary: "ص", glyph: "ص", name: "صاد" },
  { key: "ain", ordinary: "ع", glyph: "ع", name: "عين" },
  { key: "lam", ordinary: "ل", glyph: "ل", name: "لام" },
  { key: "meem", ordinary: "م", glyph: "م", name: "ميم" },
  { key: "noon", ordinary: "ن", glyph: "ن", name: "نون" },
];

const DEFAULT_LABELS = SYMBOLS.map((symbol) => symbol.glyph);
const EPSILON = 1e-6;

function parseArabicNumber(value: string) {
  const western = value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/٫|,/g, ".")
    .replace(/٬/g, "")
    .trim();
  return Number(western);
}

function toArabic(value: string | number) {
  return String(value)
    .replace(/[0-9]/g, (digit) => ARABIC_DIGITS[digit])
    .replace(".", "٫");
}

function numeric(values: string[]) {
  return values.map(parseArabicNumber);
}

function triangleTypeBySides(a: number, b: number, c: number) {
  const sorted = [a, b, c].sort((x, y) => x - y);
  const lhs = sorted[0] * sorted[0] + sorted[1] * sorted[1];
  const rhs = sorted[2] * sorted[2];
  if (Math.abs(lhs - rhs) < 0.001) return "right";
  if (lhs < rhs) return "obtuse";
  return "acute";
}

function validTriangle(a: number, b: number, c: number) {
  return [a, b, c].every((value) => Number.isFinite(value) && value > 0)
    && a + b > c && a + c > b && b + c > a;
}

function buildGeometry(
  shapeType: ShapeType,
  triangleMode: TriangleMode,
  trapezoidMode: TrapezoidMode,
  values: {
    ab: string;
    bc: string;
    ca: string;
    width: string;
    height: string;
    side: string;
    sides: string;
    angle: string;
    topBase: string;
    bottomBase: string;
    radius: string;
  },
): Geometry {
  if (shapeType === "triangle") {
    let [ab, bc, ca] = numeric([values.ab, values.bc, values.ca]);
    if (triangleMode === "right") {
      if (![ab, bc].every((value) => Number.isFinite(value) && value > 0)) {
        return { points: [], edges: [], error: "ضلعا القائمة لازم يكونا رقمين موجبين." };
      }
      ca = Math.hypot(ab, bc);
    }
    if (triangleMode === "isosceles") {
      ca = ab;
    }
    if (![ab, bc, ca].every((value) => Number.isFinite(value) && value > 0)) {
      return { points: [], edges: [], error: "كل أطوال المثلث لازم تكون أرقامًا موجبة." };
    }
    if (!validTriangle(ab, bc, ca)) {
      return { points: [], edges: [], error: "الأطوال لا تكوّن مثلثًا: مجموع أي ضلعين لازم يكون أكبر من الثالث." };
    }
    const type = triangleTypeBySides(ab, bc, ca);
    if (triangleMode === "acute" && type !== "acute") return { points: [], edges: [], error: "هذه الأطوال لا تكوّن مثلثًا حاد الزوايا." };
    if (triangleMode === "obtuse" && type !== "obtuse") return { points: [], edges: [], error: "هذه الأطوال لا تكوّن مثلثًا منفرج الزاوية." };
    if (triangleMode === "right" && type !== "right") return { points: [], edges: [], error: "تعذر تكوين مثلث قائم من هذه القيم." };
    if (triangleMode === "isosceles" && Math.abs(ab - ca) > 0.001) return { points: [], edges: [], error: "المثلث متساوي الساقين يحتاج ساقين متساويتين." };
    const ax = (ab * ab + bc * bc - ca * ca) / (2 * bc);
    const ay = Math.sqrt(Math.max(0, ab * ab - ax * ax));
    return {
      points: [
        { id: "v-0", x: ax, y: ay },
        { id: "v-1", x: 0, y: 0 },
        { id: "v-2", x: bc, y: 0 },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 0 }],
    };
  }

  if (shapeType === "rectangle") {
    const width = parseArabicNumber(values.width);
    const height = parseArabicNumber(values.height);
    if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
      return { points: [], edges: [], error: "الطول والعرض لازم يكونا رقمين موجبين." };
    }
    return {
      points: [
        { id: "v-0", x: 0, y: height },
        { id: "v-1", x: 0, y: 0 },
        { id: "v-2", x: width, y: 0 },
        { id: "v-3", x: width, y: height },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 0 }],
    };
  }

  if (shapeType === "parallelogram") {
    const width = parseArabicNumber(values.width);
    const side = parseArabicNumber(values.side);
    const angle = parseArabicNumber(values.angle);
    if (![width, side].every((value) => Number.isFinite(value) && value > 0)) {
      return { points: [], edges: [], error: "القاعدة والضلع الجانبي لازم يكونا رقمين موجبين." };
    }
    if (!Number.isFinite(angle) || angle <= 10 || angle >= 170) {
      return { points: [], edges: [], error: "زاوية الميل لازم تكون أكبر من ١٠ وأقل من ١٧٠ درجة." };
    }
    const skew = side * Math.cos((angle * Math.PI) / 180);
    const height = side * Math.sin((angle * Math.PI) / 180);
    return {
      points: [
        { id: "v-0", x: skew, y: height },
        { id: "v-1", x: 0, y: 0 },
        { id: "v-2", x: width, y: 0 },
        { id: "v-3", x: width + skew, y: height },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 0 }],
    };
  }

  if (shapeType === "rhombus") {
    const side = parseArabicNumber(values.side);
    const angle = parseArabicNumber(values.angle);
    if (!Number.isFinite(side) || side <= 0) return { points: [], edges: [], error: "طول ضلع المعين لازم يكون رقمًا موجبًا." };
    if (!Number.isFinite(angle) || angle <= 10 || angle >= 170) return { points: [], edges: [], error: "زاوية المعين لازم تكون أكبر من ١٠ وأقل من ١٧٠ درجة." };
    const dx = side * Math.cos((angle * Math.PI) / 180);
    const dy = side * Math.sin((angle * Math.PI) / 180);
    return {
      points: [
        { id: "v-0", x: dx, y: dy },
        { id: "v-1", x: 0, y: 0 },
        { id: "v-2", x: side, y: 0 },
        { id: "v-3", x: side + dx, y: dy },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 0 }],
    };
  }

  if (shapeType === "trapezoid") {
    const topBase = parseArabicNumber(values.topBase);
    const bottomBase = parseArabicNumber(values.bottomBase);
    const height = parseArabicNumber(values.height);
    if (![topBase, bottomBase, height].every((value) => Number.isFinite(value) && value > 0)) {
      return { points: [], edges: [], error: "قاعدتا شبه المنحرف والارتفاع لازم تكون أرقامًا موجبة." };
    }
    const diff = bottomBase - topBase;
    const inset = trapezoidMode === "right"
      ? 0
      : trapezoidMode === "isosceles"
        ? diff / 2
        : diff * 0.25;
    return {
      points: [
        { id: "v-0", x: inset, y: height },
        { id: "v-1", x: 0, y: 0 },
        { id: "v-2", x: bottomBase, y: 0 },
        { id: "v-3", x: inset + topBase, y: height },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 0 }],
    };
  }

  if (shapeType === "circle") {
    const radius = parseArabicNumber(values.radius);
    if (!Number.isFinite(radius) || radius <= 0) return { points: [], edges: [], error: "نصف قطر الدائرة لازم يكون رقمًا موجبًا." };
    const points = [
      { id: "v-0", x: 0, y: 0 },
      ...Array.from({ length: 8 }, (_, index) => {
        const angle = (index * Math.PI) / 4;
        return { id: `v-${index + 1}`, x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
      }),
    ];
    return {
      points,
      edges: [],
      circle: { center: 0, radiusPoint: 1, radius },
    };
  }

  const sides = Math.round(parseArabicNumber(values.sides));
  const side = parseArabicNumber(values.side);
  if (!Number.isFinite(sides) || sides < 3 || sides > 10) {
    return { points: [], edges: [], error: "عدد أضلاع المضلع المنتظم من ٣ إلى ١٠." };
  }
  if (!Number.isFinite(side) || side <= 0) {
    return { points: [], edges: [], error: "طول الضلع لازم يكون رقمًا موجبًا." };
  }
  const radius = side / (2 * Math.sin(Math.PI / sides));
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = Math.PI / 2 + (index * 2 * Math.PI) / sides;
    return { id: `v-${index}`, x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  return {
    points,
    edges: points.map((_, index) => ({ a: index, b: (index + 1) % sides })),
  };
}

function projectPoint(point: Point, edgeStart: Point, edgeEnd: Point) {
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y;
  const denominator = dx * dx + dy * dy;
  const t = ((point.x - edgeStart.x) * dx + (point.y - edgeStart.y) * dy) / denominator;
  return { x: edgeStart.x + t * dx, y: edgeStart.y + t * dy, t };
}

function polygonArea(points: Point[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function orientation(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < -EPSILON && o3 * o4 < -EPSILON;
}

function isSelfIntersecting(points: Point[]) {
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

function edgeIsAdjacent(a: number, b: number, count: number) {
  return a === b || Math.abs(a - b) === 1 || Math.abs(a - b) === count - 1;
}

function pointInPolygon(point: Point, polygon: Point[]) {
  const onBoundary = polygon.some((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const cross = Math.abs(orientation(start, end, point));
    const dot = (point.x - start.x) * (point.x - end.x) + (point.y - start.y) * (point.y - end.y);
    return cross < EPSILON && dot <= EPSILON;
  });
  if (onBoundary) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = ((pi.y > point.y) !== (pj.y > point.y))
      && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + EPSILON) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orderPolygonPoints(points: Point[]) {
  const unique = points.filter((point, index) => points.findIndex((other) => other.id === point.id) === index);
  const center = {
    x: unique.reduce((sum, point) => sum + point.x, 0) / Math.max(unique.length, 1),
    y: unique.reduce((sum, point) => sum + point.y, 0) / Math.max(unique.length, 1),
  };
  return [...unique].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
}

function allCollinear(points: Point[]) {
  if (points.length < 3) return true;
  for (let i = 2; i < points.length; i += 1) {
    if (Math.abs(orientation(points[0], points[1], points[i])) > EPSILON) return false;
  }
  return true;
}

function measuredText(value: string, unit: string) {
  const trimmed = value.trim();
  return trimmed ? `${toArabic(trimmed)} ${unit}` : "";
}

function renderMathText(value: string) {
  return toArabic(value)
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\pi/g, "π")
    .replace(/\\theta/g, "θ")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥");
}

function evaluateExpression(expression: string, x: number) {
  const normalized = expression
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\^/g, "**")
    .replace(/\bsin\b/g, "Math.sin")
    .replace(/\bcos\b/g, "Math.cos")
    .replace(/\btan\b/g, "Math.tan")
    .replace(/\bsqrt\b/g, "Math.sqrt")
    .replace(/\babs\b/g, "Math.abs")
    .replace(/\bpi\b/gi, "Math.PI");
  if (!/^[0-9xX+\-*/().,\s*MathinscoqrtabPI]+$/.test(normalized)) return null;
  try {
    // The expression is restricted to arithmetic, x, and selected Math calls.
    const result = Function("x", `"use strict"; return (${normalized.replace(/X/g, "x")});`)(x);
    return Number.isFinite(result) ? Number(result) : null;
  } catch {
    return null;
  }
}

function angleLabel(value: string, computed: number) {
  const trimmed = value.trim();
  if (!trimmed) return `${toArabic(computed)}°`;
  const parsed = parseArabicNumber(trimmed);
  return Number.isFinite(parsed) ? `${toArabic(trimmed)}°` : toArabic(trimmed);
}

function segmentIntersection(a: Point, b: Point, c: Point, d: Point) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) < EPSILON) return null;
  const ac = { x: c.x - a.x, y: c.y - a.y };
  const t = (ac.x * s.y - ac.y * s.x) / denominator;
  const u = (ac.x * r.y - ac.y * r.x) / denominator;
  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y, t, u };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [panel, setPanel] = useState<Panel>("shape");
  const [exportTarget, setExportTarget] = useState<SceneKey>("shape");
  const [shapeType, setShapeType] = useState<ShapeType>("triangle");
  const [triangleMode, setTriangleMode] = useState<TriangleMode>("scalene");
  const [trapezoidMode, setTrapezoidMode] = useState<TrapezoidMode>("normal");
  const [values, setValues] = useState({
    ab: "٧",
    bc: "٨",
    ca: "٦",
    width: "٩",
    height: "٦",
    side: "٥",
    sides: "٥",
    angle: "٦٥",
    topBase: "٥",
    bottomBase: "٩",
    radius: "٤",
  });
  const [vertexLabels, setVertexLabels] = useState(DEFAULT_LABELS.slice(0, 3));
  const [unit, setUnit] = useState("سم");
  const [showDimensions, setShowDimensions] = useState(false);
  const [ratio, setRatio] = useState("4:3");
  const [exportWidth, setExportWidth] = useState("١٦٠٠");
  const [topText, setTopText] = useState("");
  const [bottomText, setBottomText] = useState("");
  const [diagonals, setDiagonals] = useState<Diagonal[]>([]);
  const [diagA, setDiagA] = useState(0);
  const [diagB, setDiagB] = useState(2);
  const [diagonalLabel, setDiagonalLabel] = useState("");
  const [diagonalDashed, setDiagonalDashed] = useState(false);
  const [altitudes, setAltitudes] = useState<Altitude[]>([]);
  const [altSource, setAltSource] = useState(0);
  const [altTargetId, setAltTargetId] = useState("");
  const [altMode, setAltMode] = useState<"internal" | "external">("internal");
  const [footLabel, setFootLabel] = useState(DEFAULT_LABELS[3]);
  const [altitudeLabel, setAltitudeLabel] = useState("");
  const [footToStartLabel, setFootToStartLabel] = useState("");
  const [footToEndLabel, setFootToEndLabel] = useState("");
  const [altitudeDashed, setAltitudeDashed] = useState(false);
  const [angles, setAngles] = useState<AngleMark[]>([]);
  const [angleA, setAngleA] = useState("v-0");
  const [angleB, setAngleB] = useState("v-1");
  const [angleC, setAngleC] = useState("v-2");
  const [angleValue, setAngleValue] = useState("");
  const [shadeDraft, setShadeDraft] = useState<string[]>([]);
  const [shadeStyle, setShadeStyle] = useState<Shading["style"]>("hatch");
  const [shadings, setShadings] = useState<Shading[]>([]);
  const [circleConstructions, setCircleConstructions] = useState<CircleConstruction[]>([]);
  const [circleTool, setCircleTool] = useState<CircleTool>("radius");
  const [circleA, setCircleA] = useState(1);
  const [circleB, setCircleB] = useState(3);
  const [circleLabel, setCircleLabel] = useState("");
  const [circleFootLabel, setCircleFootLabel] = useState(DEFAULT_LABELS[9] || "ن");
  const [circleDashed, setCircleDashed] = useState(false);
  const [manualPoints, setManualPoints] = useState<ManualPoint[]>([]);
  const [freePoints, setFreePoints] = useState<FreePoint[]>([]);
  const [pointInsertMode, setPointInsertMode] = useState(false);
  const [manualPointLabel, setManualPointLabel] = useState(DEFAULT_LABELS[10] || "ن");
  const [connections, setConnections] = useState<CustomConnection[]>([]);
  const [connectionA, setConnectionA] = useState("v-0");
  const [connectionB, setConnectionB] = useState("v-1");
  const [connectionLabel, setConnectionLabel] = useState("");
  const [connectionDashed, setConnectionDashed] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [textInsertMode, setTextInsertMode] = useState(false);
  const [floatingTextDraft, setFloatingTextDraft] = useState("");
  const [floatingTextSize, setFloatingTextSize] = useState("٣٠");
  const [axesMode, setAxesMode] = useState<"grid" | "plain">("grid");
  const [axesVariant, setAxesVariant] = useState<"equal" | "q1" | "q2" | "q3" | "q4">("equal");
  const [showAxes, setShowAxes] = useState(false);
  const [axesPointLabel, setAxesPointLabel] = useState("س");
  const [axesX, setAxesX] = useState("١");
  const [axesY, setAxesY] = useState("١");
  const [functionExpression, setFunctionExpression] = useState("x^2");
  const [functionFrom, setFunctionFrom] = useState("٠");
  const [functionTo, setFunctionTo] = useState("٥");
  const [functionGraphs, setFunctionGraphs] = useState<FunctionGraph[]>([]);
  const [mechanicType, setMechanicType] = useState<MechanicElement["type"]>("force");
  const [mechanicLabel, setMechanicLabel] = useState("ق");
  const [mechanicAngle, setMechanicAngle] = useState("٠");
  const [mechanicDashed, setMechanicDashed] = useState(false);
  const [mechanicElements, setMechanicElements] = useState<MechanicElement[]>([]);
  const [csvText, setCsvText] = useState("");
  const [batchScenes, setBatchScenes] = useState<string[]>([]);
  const [showConstructions, setShowConstructions] = useState(true);
  const [showShading, setShowShading] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const [lineWeight, setLineWeight] = useState("٤");
  const [labelScale, setLabelScale] = useState("١٠٠");
  const [labelOffsets, setLabelOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [labelOffsetPoint, setLabelOffsetPoint] = useState("v-0");
  const [visibleCirclePoints, setVisibleCirclePoints] = useState<number[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const geometry = useMemo(() => buildGeometry(shapeType, triangleMode, trapezoidMode, values), [shapeType, triangleMode, trapezoidMode, values]);
  const vertexCount = geometry.points.length
    || (shapeType === "triangle" ? 3 : shapeType === "circle" ? 9 : shapeType === "regular" ? Math.max(3, Math.min(10, Math.round(parseArabicNumber(values.sides)) || 3)) : 4);

  useEffect(() => {
    setVertexLabels((current) => Array.from({ length: vertexCount }, (_, index) => current[index] || DEFAULT_LABELS[index] || `ن${toArabic(index + 1)}`));
    setDiagonals([]);
    setAltitudes([]);
    setAngles([]);
    setShadings([]);
    setCircleConstructions([]);
    setManualPoints([]);
    setFreePoints([]);
    setConnections([]);
    setFloatingTexts([]);
    setShadeDraft([]);
    setDiagA(0);
    setDiagB(Math.min(2, vertexCount - 1));
    setAltSource(0);
    setAltTargetId("");
    setFootLabel(DEFAULT_LABELS[vertexCount] || DEFAULT_LABELS.at(-1) || "ن");
    setDiagonalLabel("");
    setDiagonalDashed(false);
    setAltitudeLabel("");
    setFootToStartLabel("");
    setFootToEndLabel("");
    setAltitudeDashed(false);
    setCircleA(1);
    setCircleB(3);
    setCircleLabel("");
    setCircleDashed(false);
    setCircleFootLabel(DEFAULT_LABELS[vertexCount] || DEFAULT_LABELS.at(-1) || "ن");
    setManualPointLabel(DEFAULT_LABELS[vertexCount + 1] || DEFAULT_LABELS.at(-1) || "ن");
    setLabelOffsets({});
    setLabelOffsetPoint("v-0");
    setVisibleCirclePoints([]);
  }, [shapeType, triangleMode, trapezoidMode, vertexCount]);

  const basePoints: Point[] = useMemo(() => geometry.points.map((point, index) => ({
    ...point,
    label: vertexLabels[index] || DEFAULT_LABELS[index] || "؟",
    kind: "vertex" as const,
  })), [geometry.points, vertexLabels]);

  const lineTargets = useMemo<LineTarget[]>(() => {
    const edgeTargets = geometry.edges.map((edge, index) => ({
      id: `edge-${index}`,
      kind: "edge" as const,
      index,
      a: edge.a,
      b: edge.b,
      label: `ضلع ${edgeLabel(edge)}`,
    }));
    const diagonalTargets = diagonals.map((diagonal, index) => ({
      id: `diagonal-${diagonal.id}`,
      kind: "diagonal" as const,
      index,
      a: diagonal.a,
      b: diagonal.b,
      label: `قطر ${labelForVertex(diagonal.a)} ${labelForVertex(diagonal.b)}`,
    }));
    if (shapeType === "rectangle") return diagonalTargets;
    return [...edgeTargets, ...diagonalTargets];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry.edges, diagonals, shapeType, vertexLabels]);

  useEffect(() => {
    setAltTargetId((current) => (lineTargets.some((target) => target.id === current) ? current : lineTargets[0]?.id || ""));
  }, [lineTargets]);

  const computedAltitudes = useMemo(() => altitudes.flatMap((altitude) => {
    const source = basePoints[altitude.source];
    const target = lineTargets.find((item) => item.id === altitude.targetId);
    if (!source || !target) return [];
    const start = basePoints[target.a];
    const end = basePoints[target.b];
    if (!start || !end) return [];
    const foot = projectPoint(source, start, end);
    return [{
      ...altitude,
      target,
      foot: { id: `f-${altitude.id}`, x: foot.x, y: foot.y, label: altitude.footLabel, kind: "foot" as const },
      t: foot.t,
      start,
      end,
      sourcePoint: source,
    }];
  }), [altitudes, basePoints, lineTargets]);

  const diagonalIntersections = useMemo(() => {
    const usedLabels = new Set([
      ...basePoints.map((point) => point.label),
      ...computedAltitudes.map((item) => item.foot.label),
    ]);
    const intersections: Array<{ point: Point; endpoints: string[]; diagonalIds: string[] }> = [];
    for (let i = 0; i < diagonals.length; i += 1) {
      for (let j = i + 1; j < diagonals.length; j += 1) {
        const first = diagonals[i];
        const second = diagonals[j];
        if ([first.a, first.b].some((index) => index === second.a || index === second.b)) continue;
        const a = basePoints[first.a];
        const b = basePoints[first.b];
        const c = basePoints[second.a];
        const d = basePoints[second.b];
        if (!a || !b || !c || !d) continue;
        const hit = segmentIntersection(a, b, c, d);
        if (!hit) continue;
        if (intersections.some((item) => Math.hypot(item.point.x - hit.x, item.point.y - hit.y) < 0.001)) continue;
        const label = SYMBOLS.find((symbol) => !usedLabels.has(symbol.glyph))?.glyph || `ن${toArabic(intersections.length + 1)}`;
        usedLabels.add(label);
        intersections.push({
          point: {
            id: `x-${first.id}-${second.id}`,
            x: hit.x,
            y: hit.y,
            label,
            kind: "intersection",
          },
          endpoints: [`v-${first.a}`, `v-${first.b}`, `v-${second.a}`, `v-${second.b}`],
          diagonalIds: [first.id, second.id],
        });
      }
    }
    return intersections;
  }, [basePoints, computedAltitudes, diagonals]);

  const computedCircleConstructions = useMemo(() => {
    if (!geometry.circle) return [];
    const center = basePoints[geometry.circle.center];
    if (!center) return [];
    return circleConstructions.flatMap((item) => {
      const first = basePoints[item.a];
      const second = basePoints[item.b];
      if (!first || !second) return [];
      const opposite = basePoints[((item.a - 1 + 4) % 8) + 1] || second;
      const chordEnd = item.type === "diameter" ? opposite : second;
      const footProjection = item.type === "chordAltitude" ? projectPoint(center, first, chordEnd) : null;
      const foot = footProjection ? {
        id: `cf-${item.id}`,
        x: footProjection.x,
        y: footProjection.y,
        label: item.footLabel,
        kind: "foot" as const,
      } : null;
      return [{ ...item, center, first, second: chordEnd, foot }];
    });
  }, [basePoints, circleConstructions, geometry.circle]);

  const resolvedSegments = useMemo<ResolvedSegment[]>(() => {
    const edgeSegments = geometry.edges.flatMap((edge, index) => {
      const start = basePoints[edge.a];
      const end = basePoints[edge.b];
      return start && end ? [{
        id: `edge-${index}`,
        start,
        end,
        label: `ضلع ${edgeLabel(edge)}`,
      }] : [];
    });
    const diagonalSegments = diagonals.flatMap((diagonal) => {
      const start = basePoints[diagonal.a];
      const end = basePoints[diagonal.b];
      return start && end ? [{
        id: `diagonal-${diagonal.id}`,
        start,
        end,
        label: `قطر ${labelForVertex(diagonal.a)} ${labelForVertex(diagonal.b)}`,
        dashed: diagonal.dashed,
      }] : [];
    });
    const altitudeSegments = computedAltitudes.flatMap((altitude) => [
      {
        id: `altitude-${altitude.id}`,
        start: altitude.sourcePoint,
        end: altitude.foot,
        label: `عمود ${altitude.sourcePoint.label} ${altitude.foot.label}`,
        dashed: altitude.dashed,
      },
      {
        id: `altitude-start-${altitude.id}`,
        start: altitude.foot,
        end: altitude.start,
        label: `${altitude.foot.label} ${altitude.start.label}`,
      },
      {
        id: `altitude-end-${altitude.id}`,
        start: altitude.foot,
        end: altitude.end,
        label: `${altitude.foot.label} ${altitude.end.label}`,
      },
    ]);
    const circleSegments = computedCircleConstructions.flatMap((item) => {
      if (item.type === "radius") return [{ id: `circle-${item.id}`, start: item.center, end: item.first, label: `نصف قطر ${item.first.label}`, dashed: item.dashed }];
      if (item.type === "diameter" || item.type === "chord") return [{ id: `circle-${item.id}`, start: item.first, end: item.second, label: item.type === "diameter" ? "قطر دائرة" : "وتر", dashed: item.dashed }];
      if (item.type === "chordAltitude" && item.foot) {
        return [
          { id: `circle-chord-${item.id}`, start: item.first, end: item.second, label: "وتر", dashed: item.dashed },
          { id: `circle-altitude-${item.id}`, start: item.center, end: item.foot, label: `عمود ${item.center.label} ${item.foot.label}`, dashed: item.dashed },
        ];
      }
      return [{ id: `circle-${item.id}`, start: item.center, end: item.first, label: "نصف قطر على مماس", dashed: item.dashed }];
    });
    return [...edgeSegments, ...diagonalSegments, ...altitudeSegments, ...circleSegments];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePoints, computedAltitudes, computedCircleConstructions, diagonals, geometry.edges, vertexLabels]);

  const computedManualPoints = useMemo(() => manualPoints.flatMap((item) => {
    const segment = resolvedSegments.find((value) => value.id === item.segmentId);
    if (!segment) return [];
    return [{
      id: item.id,
      x: segment.start.x + (segment.end.x - segment.start.x) * item.t,
      y: segment.start.y + (segment.end.y - segment.start.y) * item.t,
      label: item.label,
      kind: "manual" as const,
    }];
  }), [manualPoints, resolvedSegments]);

  const computedFreePoints = useMemo<Point[]>(() => freePoints.map((point) => ({
    id: point.id,
    x: point.x,
    y: point.y,
    label: point.label,
    kind: point.source === "axes" ? "axes" : "free",
  })), [freePoints]);

  const allPoints = useMemo(() => [
    ...basePoints,
    ...diagonalIntersections.map((item) => item.point),
    ...computedCircleConstructions.flatMap((item) => (item.foot ? [item.foot] : [])),
    ...computedAltitudes.map((item) => item.foot),
    ...computedManualPoints,
    ...computedFreePoints,
  ], [basePoints, computedAltitudes, computedCircleConstructions, computedFreePoints, computedManualPoints, diagonalIntersections]);

  const pointMap = useMemo(() => new Map(allPoints.map((point) => [point.id, point])), [allPoints]);
  const duplicateLabels = new Set(vertexLabels).size !== vertexLabels.length
    || allPoints.some((point, index) => allPoints.findIndex((other) => other.label === point.label) !== index);

  function circlePointIndex(point: Point) {
    if (!point.id.startsWith("v-")) return null;
    const index = Number(point.id.replace("v-", ""));
    return Number.isFinite(index) && index >= 1 && index <= 8 ? index : null;
  }

  function isVisibleCirclePoint(point: Point) {
    if (shapeType !== "circle") return true;
    if (point.id === "v-0") return true;
    const index = circlePointIndex(point);
    return index === null || visibleCirclePoints.includes(index);
  }

  const displayedPoints = useMemo(() => allPoints.filter(isVisibleCirclePoint), [allPoints, shapeType, visibleCirclePoints]);

  useEffect(() => {
    setLabelOffsetPoint((current) => (displayedPoints.some((point) => point.id === current) ? current : displayedPoints[0]?.id || ""));
    const displayedIds = new Set(displayedPoints.map((point) => point.id));
    setShadeDraft((current) => current.filter((id) => displayedIds.has(id)));
    setAngleA((current) => (displayedIds.has(current) ? current : displayedPoints[0]?.id || current));
    setAngleB((current) => (displayedIds.has(current) ? current : displayedPoints[1]?.id || displayedPoints[0]?.id || current));
    setAngleC((current) => (displayedIds.has(current) ? current : displayedPoints[2]?.id || displayedPoints[0]?.id || current));
  }, [displayedPoints]);

  const ratioValue = ratio === "1:1" ? 1 : ratio === "16:9" ? 16 / 9 : ratio === "9:16" ? 9 / 16 : 4 / 3;
  const canvasWidth = 1000;
  const canvasHeight = canvasWidth / ratioValue;

  const bounds = useMemo(() => {
    const points = allPoints.length ? allPoints : [{ id: "empty", x: 0, y: 0, label: "", kind: "vertex" as const }];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    };
  }, [allPoints]);

  const screenPoint = (point: Point) => {
    const xSpan = Math.max(bounds.maxX - bounds.minX, 1);
    const ySpan = Math.max(bounds.maxY - bounds.minY, 1);
    const horizontalMargin = 105;
    const verticalMargin = 110;
    const scale = Math.min(
      (canvasWidth - horizontalMargin * 2) / xSpan,
      (canvasHeight - verticalMargin * 2) / ySpan,
    );
    const usedWidth = xSpan * scale;
    const usedHeight = ySpan * scale;
    const offsetX = (canvasWidth - usedWidth) / 2;
    const offsetY = (canvasHeight - usedHeight) / 2;
    return {
      x: offsetX + (point.x - bounds.minX) * scale,
      y: canvasHeight - (offsetY + (point.y - bounds.minY) * scale),
    };
  };

  function canvasToModel(screen: { x: number; y: number }) {
    const xSpan = Math.max(bounds.maxX - bounds.minX, 1);
    const ySpan = Math.max(bounds.maxY - bounds.minY, 1);
    const horizontalMargin = 105;
    const verticalMargin = 110;
    const scale = Math.min(
      (canvasWidth - horizontalMargin * 2) / xSpan,
      (canvasHeight - verticalMargin * 2) / ySpan,
    );
    const usedWidth = xSpan * scale;
    const usedHeight = ySpan * scale;
    const offsetX = (canvasWidth - usedWidth) / 2;
    const offsetY = (canvasHeight - usedHeight) / 2;
    return {
      x: bounds.minX + (screen.x - offsetX) / scale,
      y: bounds.minY + (canvasHeight - screen.y - offsetY) / scale,
    };
  }

  const centroid = useMemo(() => {
    if (!basePoints.length) return { x: 0, y: 0 };
    return {
      x: basePoints.reduce((sum, point) => sum + point.x, 0) / basePoints.length,
      y: basePoints.reduce((sum, point) => sum + point.y, 0) / basePoints.length,
    };
  }, [basePoints]);

  function setValue(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggleCirclePoint(index: number) {
    setVisibleCirclePoints((current) => (
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort((a, b) => a - b)
    ));
  }

  function tell(type: "ok" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 4200);
  }

  function currentScene(): SceneKey {
    return panel === "style" ? exportTarget : panel;
  }

  function switchPanel(nextPanel: Panel) {
    setPanel(nextPanel);
    setPointInsertMode(false);
    setTextInsertMode(false);
  }

  function setPointInsertEnabled(enabled: boolean) {
    setPointInsertMode(enabled);
    if (enabled) setTextInsertMode(false);
  }

  function setTextInsertEnabled(enabled: boolean) {
    setTextInsertMode(enabled);
    if (enabled) setPointInsertMode(false);
  }

  function labelForVertex(index: number) {
    return vertexLabels[index] || "؟";
  }

  function edgeLabel(edge: Edge) {
    return `${labelForVertex(edge.a)} ${labelForVertex(edge.b)}`;
  }

  function addDiagonal() {
    if (geometry.error || !basePoints.length) return tell("error", geometry.error || "أكمل بيانات الشكل أولًا.");
    if (shapeType === "circle") return tell("error", "الدائرة لا تحتوي أقطارًا بين رؤوس مرسومة في هذه النسخة.");
    if (edgeIsAdjacent(diagA, diagB, basePoints.length)) return tell("error", "القطر لازم يصل بين رأسين غير متجاورين.");
    if (diagonals.some((item) => (item.a === diagA && item.b === diagB) || (item.a === diagB && item.b === diagA))) {
      return tell("error", "هذا القطر موجود بالفعل.");
    }
    setDiagonals((current) => [...current, {
      id: crypto.randomUUID(), a: diagA, b: diagB, label: diagonalLabel, dashed: diagonalDashed,
    }]);
    setDiagonalLabel("");
    tell("ok", "تمت إضافة القطر وربطه بالرأسين.");
  }

  function addAltitude() {
    if (geometry.error || !basePoints.length) return tell("error", geometry.error || "أكمل بيانات الشكل أولًا.");
    const target = lineTargets.find((item) => item.id === altTargetId);
    if (!target) {
      return tell("error", shapeType === "rectangle" ? "أضف قطرًا للمستطيل أولًا، ثم أسقط العمود عليه." : "اختر خطًا صالحًا لإسقاط العمود.");
    }
    if (target.a === altSource || target.b === altSource) return tell("error", "لا يمكن إسقاط عمود على خط يمر بالرأس نفسه.");
    if (allPoints.some((point) => point.label === footLabel)) return tell("error", "اسم قدم العمود مستخدم بالفعل.");
    const source = basePoints[altSource];
    const foot = projectPoint(source, basePoints[target.a], basePoints[target.b]);
    const isInternal = foot.t >= -EPSILON && foot.t <= 1 + EPSILON;
    if (altMode === "internal" && !isInternal) return tell("error", "قدم العمود تقع على امتداد الضلع؛ اختر عمودًا خارجيًا.");
    if (altMode === "external" && isInternal) return tell("error", "قدم العمود تقع داخل الضلع؛ اختر عمودًا داخليًا.");
    setAltitudes((current) => [...current, {
      id: crypto.randomUUID(),
      source: altSource,
      targetId: target.id,
      footLabel,
      mode: altMode,
      altitudeLabel,
      footToStartLabel,
      footToEndLabel,
      dashed: altitudeDashed,
    }]);
    const next = SYMBOLS.find((symbol) => !allPoints.some((point) => point.label === symbol.glyph) && symbol.glyph !== footLabel);
    if (next) setFootLabel(next.glyph);
    setAltitudeLabel("");
    setFootToStartLabel("");
    setFootToEndLabel("");
    tell("ok", altMode === "internal" ? "تمت إضافة العمود الداخلي." : "تمت إضافة العمود على امتداد الضلع.");
  }

  function addCircleConstruction() {
    if (shapeType !== "circle" || !geometry.circle) return tell("error", "اختر دائرة أولًا.");
    if (circleA === 0 || circleB === 0) return tell("error", "اختر نقطة على محيط الدائرة وليس المركز.");
    if (["chord", "chordAltitude"].includes(circleTool) && circleA === circleB) return tell("error", "الوتر يحتاج نقطتين مختلفتين على الدائرة.");
    if (circleTool === "chord" && Math.abs(circleA - circleB) === 4) return tell("error", "النقطتان المتقابلتان تكوّنان قطرًا؛ اختر أداة القطر.");
    if (circleTool === "chordAltitude" && allPoints.some((point) => point.label === circleFootLabel)) return tell("error", "اسم قدم العمود مستخدم بالفعل.");
    setCircleConstructions((current) => [...current, {
      id: crypto.randomUUID(),
      type: circleTool,
      a: circleA,
      b: circleB,
      label: circleLabel,
      footLabel: circleFootLabel,
      dashed: circleDashed,
    }]);
    const next = SYMBOLS.find((symbol) => !allPoints.some((point) => point.label === symbol.glyph) && symbol.glyph !== circleFootLabel);
    if (next) setCircleFootLabel(next.glyph);
    setCircleLabel("");
    tell("ok", "تمت إضافة إنشاء الدائرة.");
  }

  function connectionExists(first: string, second: string) {
    if (first === second) return false;
    const firstVertex = Number(first.replace("v-", ""));
    const secondVertex = Number(second.replace("v-", ""));
    if (first.startsWith("v-") && second.startsWith("v-")) {
      if (geometry.edges.some((edge) => (edge.a === firstVertex && edge.b === secondVertex) || (edge.a === secondVertex && edge.b === firstVertex))) return true;
      if (diagonals.some((item) => (item.a === firstVertex && item.b === secondVertex) || (item.a === secondVertex && item.b === firstVertex))) return true;
    }
    if (diagonalIntersections.some((item) => {
      const pointId = item.point.id;
      return (first === pointId && item.endpoints.includes(second)) || (second === pointId && item.endpoints.includes(first));
    })) return true;
    if (manualPoints.some((item) => {
      const segment = resolvedSegments.find((value) => value.id === item.segmentId);
      if (!segment) return false;
      const endpoints = [segment.start.id, segment.end.id];
      if ((first === item.id && endpoints.includes(second)) || (second === item.id && endpoints.includes(first))) return true;
      return manualPoints.some((other) => other.id !== item.id
        && other.segmentId === item.segmentId
        && ((first === item.id && second === other.id) || (second === item.id && first === other.id)));
    })) return true;
    if (connections.some((item) => (item.a === first && item.b === second) || (item.a === second && item.b === first))) return true;
    if (computedCircleConstructions.some((item) => {
      const centerId = `v-${geometry.circle?.center ?? 0}`;
      const firstId = `v-${item.a}`;
      const secondId = `v-${item.b}`;
      const diameterEndId = item.type === "diameter" ? `v-${((item.a - 1 + 4) % 8) + 1}` : secondId;
      if (item.type === "radius") return (first === centerId && second === firstId) || (first === firstId && second === centerId);
      if (item.type === "diameter" || item.type === "chord") return (first === firstId && second === diameterEndId) || (first === diameterEndId && second === firstId);
      if (item.type === "tangentAltitude") return (first === centerId && second === firstId) || (first === firstId && second === centerId);
      const footId = item.foot?.id;
      return Boolean(footId && (
        (first === centerId && second === footId) || (first === footId && second === centerId)
        || (first === firstId && second === footId) || (first === footId && second === firstId)
        || (first === diameterEndId && second === footId) || (first === footId && second === diameterEndId)
      ));
    })) return true;
    return computedAltitudes.some((item) => {
      const footId = item.foot.id;
      const sourceId = `v-${item.source}`;
      const valid = new Set([sourceId, `v-${item.target.a}`, `v-${item.target.b}`]);
      return (first === footId && valid.has(second)) || (second === footId && valid.has(first));
    });
  }

  function removeDiagonal(id: string) {
    setDiagonals((current) => current.filter((item) => item.id !== id));
    setAngles((current) => current.filter((item) => ![item.a, item.b, item.c].some((pointId) => pointId.includes(id))));
    setShadings((current) => current.filter((item) => !item.pointIds.some((pointId) => pointId.includes(id))));
    setShadeDraft((current) => current.filter((pointId) => !pointId.includes(id)));
  }

  function addAngle() {
    if ([angleA, angleB, angleC].some((id, index, items) => items.indexOf(id) !== index)) return tell("error", "اختر ثلاث نقاط مختلفة للزاوية.");
    const a = pointMap.get(angleA);
    const b = pointMap.get(angleB);
    const c = pointMap.get(angleC);
    if (!a || !b || !c) return tell("error", "إحدى نقاط الزاوية غير موجودة.");
    if (Math.abs(orientation(a, b, c)) < EPSILON) return tell("error", "النقاط الثلاث على استقامة واحدة ولا تكوّن زاوية.");
    if (!connectionExists(angleB, angleA) || !connectionExists(angleB, angleC)) {
      return tell("error", "ضلعا الزاوية لازم يكونا مرسومين كضلع أو قطر أو خط إنشائي.");
    }
    setAngles((current) => [...current, { id: crypto.randomUUID(), a: angleA, b: angleB, c: angleC, value: angleValue }]);
    tell("ok", "تمت إضافة قوس الزاوية.");
  }

  function toggleShadePoint(id: string) {
    setShadeDraft((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function addShading() {
    if (shadeDraft.length < 3) return tell("error", "التظليل يحتاج ثلاثة رؤوس على الأقل.");
    const rawPoints = shadeDraft.map((id) => pointMap.get(id)).filter(Boolean) as Point[];
    const points = orderPolygonPoints(rawPoints);
    if (points.length !== shadeDraft.length) return tell("error", "إحدى نقاط التظليل لم تعد موجودة.");
    if (allCollinear(points)) return tell("error", "نقاط التظليل على استقامة واحدة ولا تكوّن مساحة.");
    if (polygonArea(points) < EPSILON) return tell("error", "المساحة المختارة تساوي صفرًا.");
    if (isSelfIntersecting(points)) return tell("error", "حدود منطقة التظليل تتقاطع مع نفسها.");
    const orderedIds = points.map((point) => point.id);
    for (let index = 0; index < orderedIds.length; index += 1) {
      const current = orderedIds[index];
      const next = orderedIds[(index + 1) % orderedIds.length];
      if (!connectionExists(current, next)) return tell("error", "كل نقطتين متتاليتين في التظليل لازم يربطهما خط مرسوم.");
    }
    const basePolygon = basePoints;
    if (points.some((point) => point.kind !== "vertex" && !pointInPolygon(point, basePolygon)
      && !computedAltitudes.some((altitude) => altitude.foot.id === point.id && altitude.mode === "external"))) {
      return tell("error", "منطقة التظليل تحتوي نقطة خارج الشكل.");
    }
    setShadings((current) => [...current, { id: crypto.randomUUID(), pointIds: orderedIds, style: shadeStyle }]);
    setShadeDraft([]);
    tell("ok", "تمت إضافة منطقة التظليل.");
  }

  function removeAltitude(id: string) {
    const footId = `f-${id}`;
    setAltitudes((current) => current.filter((item) => item.id !== id));
    setAngles((current) => current.filter((item) => ![item.a, item.b, item.c].includes(footId)));
    setShadings((current) => current.filter((item) => !item.pointIds.includes(footId)));
    setShadeDraft((current) => current.filter((item) => item !== footId));
  }

  function removeManualPoint(id: string) {
    setManualPoints((current) => current.filter((item) => item.id !== id));
    setFreePoints((current) => current.filter((item) => item.id !== id));
    setConnections((current) => current.filter((item) => item.a !== id && item.b !== id));
    setAngles((current) => current.filter((item) => ![item.a, item.b, item.c].includes(id)));
    setShadings((current) => current.filter((item) => !item.pointIds.includes(id)));
    setShadeDraft((current) => current.filter((item) => item !== id));
    setLabelOffsets((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function addConnection() {
    if (connectionA === connectionB) return tell("error", "اختر نقطتين مختلفتين للتوصيل.");
    if (!pointMap.get(connectionA) || !pointMap.get(connectionB)) return tell("error", "إحدى النقطتين غير موجودة.");
    setConnections((current) => [...current, {
      id: crypto.randomUUID(),
      a: connectionA,
      b: connectionB,
      label: connectionLabel,
      dashed: connectionDashed,
    }]);
    setConnectionLabel("");
    tell("ok", "تمت إضافة التوصيل.");
  }

  function sideMeasurement(index: number) {
    if (shapeType === "circle") return "";
    if (shapeType === "triangle") {
      if (triangleMode === "right" && index === 2) return String(Math.round(Math.hypot(parseArabicNumber(values.ab), parseArabicNumber(values.bc)) * 100) / 100);
      if (triangleMode === "isosceles" && index === 2) return values.ab;
      return [values.ab, values.bc, values.ca][index] || "";
    }
    if (shapeType === "rectangle") return index % 2 === 0 ? values.height : values.width;
    if (shapeType === "regular" || shapeType === "rhombus") return values.side;
    if (shapeType === "parallelogram") return index % 2 === 0 ? values.side : values.width;
    if (shapeType === "trapezoid") {
      if (index === 1) return values.bottomBase;
      if (index === 3) return values.topBase;
      const edge = geometry.edges[index];
      const start = edge && basePoints[edge.a];
      const end = edge && basePoints[edge.b];
      if (!start || !end) return "";
      return String(Math.round(Math.hypot(end.x - start.x, end.y - start.y) * 100) / 100);
    }
    return values.side;
  }

  function angleDrawing(mark: AngleMark) {
    const a = pointMap.get(mark.a);
    const b = pointMap.get(mark.b);
    const c = pointMap.get(mark.c);
    if (!a || !b || !c) return null;
    const sa = screenPoint(a);
    const sb = screenPoint(b);
    const sc = screenPoint(c);
    const startAngle = Math.atan2(sa.y - sb.y, sa.x - sb.x);
    const endAngle = Math.atan2(sc.y - sb.y, sc.x - sb.x);
    let delta = endAngle - startAngle;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    const radius = 31;
    const start = { x: sb.x + Math.cos(startAngle) * radius, y: sb.y + Math.sin(startAngle) * radius };
    const end = { x: sb.x + Math.cos(startAngle + delta) * radius, y: sb.y + Math.sin(startAngle + delta) * radius };
    const mid = startAngle + delta / 2;
    const labelRadius = 53;
    const vectorA = { x: a.x - b.x, y: a.y - b.y };
    const vectorC = { x: c.x - b.x, y: c.y - b.y };
    const cosine = (vectorA.x * vectorC.x + vectorA.y * vectorC.y)
      / (Math.hypot(vectorA.x, vectorA.y) * Math.hypot(vectorC.x, vectorC.y));
    const computed = Math.round((Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI * 10) / 10;
    const requested = parseArabicNumber(mark.value);
    const isRight = Math.abs((Number.isFinite(requested) ? requested : computed) - 90) < 0.5;
    if (isRight) {
      const arm = 26;
      const vaLength = Math.hypot(sa.x - sb.x, sa.y - sb.y) || 1;
      const vcLength = Math.hypot(sc.x - sb.x, sc.y - sb.y) || 1;
      const ux = (sa.x - sb.x) / vaLength;
      const uy = (sa.y - sb.y) / vaLength;
      const vx = (sc.x - sb.x) / vcLength;
      const vy = (sc.y - sb.y) / vcLength;
      const p1 = { x: sb.x + ux * arm, y: sb.y + uy * arm };
      const p2 = { x: p1.x + vx * arm, y: p1.y + vy * arm };
      const p3 = { x: sb.x + vx * arm, y: sb.y + vy * arm };
      return {
        rightPoints: `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
        labelX: sb.x + (ux + vx) * 45,
        labelY: sb.y + (uy + vy) * 45,
        label: angleLabel(mark.value, computed),
      };
    }
    return {
      path: `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${delta > 0 ? 1 : 0} ${end.x} ${end.y}`,
      labelX: sb.x + Math.cos(mid) * labelRadius,
      labelY: sb.y + Math.sin(mid) * labelRadius,
      label: angleLabel(mark.value, computed),
    };
  }

  function segmentLabel(start: Point, end: Point, value: string, key: string, offset = 28) {
    const text = measuredText(value, unit);
    if (!text) return null;
    const a = screenPoint(start);
    const b = screenPoint(end);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;
    const x = (a.x + b.x) / 2 - (dy / length) * offset;
    const y = (a.y + b.y) / 2 + (dx / length) * offset;
    return <text key={key} className="measure-label construction-measure" x={x} y={y} transform={`rotate(${angle} ${x} ${y})`}>{text}</text>;
  }

  function pointLineDistance(screen: { x: number; y: number }, segment: ResolvedSegment) {
    const start = screenPoint(segment.start);
    const end = screenPoint(segment.end);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const denominator = dx * dx + dy * dy || 1;
    const rawT = ((screen.x - start.x) * dx + (screen.y - start.y) * dy) / denominator;
    const t = Math.max(0, Math.min(1, rawT));
    const projected = { x: start.x + dx * t, y: start.y + dy * t };
    return { distance: Math.hypot(screen.x - projected.x, screen.y - projected.y), t };
  }

  function addManualPointAt(screen: { x: number; y: number }) {
    const ranked = resolvedSegments
      .map((segment) => ({ segment, ...pointLineDistance(screen, segment) }))
      .sort((a, b) => a.distance - b.distance);
    const best = ranked[0];
    if (allPoints.some((point) => point.label === manualPointLabel)) return tell("error", "رمز النقطة مستخدم بالفعل.");
    const circleSnap = (() => {
      if (!geometry.circle) return null;
      const center = basePoints[geometry.circle.center];
      const radiusPoint = basePoints[geometry.circle.radiusPoint];
      if (!center || !radiusPoint) return null;
      const mappedCenter = screenPoint(center);
      const mappedRadius = screenPoint(radiusPoint);
      const radius = Math.hypot(mappedRadius.x - mappedCenter.x, mappedRadius.y - mappedCenter.y);
      const distance = Math.hypot(screen.x - mappedCenter.x, screen.y - mappedCenter.y);
      if (Math.abs(distance - radius) > 24) return null;
      const angle = Math.atan2(screen.y - mappedCenter.y, screen.x - mappedCenter.x);
      return {
        x: center.x + geometry.circle.radius * Math.cos(angle),
        y: center.y - geometry.circle.radius * Math.sin(angle),
      };
    })();
    if (best && best.distance <= 22) {
      setManualPoints((current) => [...current, {
        id: crypto.randomUUID(),
        segmentId: best.segment.id,
        t: Math.round(best.t * 1000) / 1000,
        label: manualPointLabel,
      }]);
      tell("ok", `تمت إضافة نقطة على ${best.segment.label}.`);
    } else {
      const modelPoint = circleSnap || canvasToModel(screen);
      setFreePoints((current) => [...current, {
        id: crypto.randomUUID(),
        x: modelPoint.x,
        y: modelPoint.y,
        label: manualPointLabel,
        source: "canvas",
      }]);
      tell("ok", circleSnap ? "تمت إضافة نقطة على محيط الدائرة." : "تمت إضافة نقطة حرة داخل الصورة.");
    }
    const next = SYMBOLS.find((symbol) => !allPoints.some((point) => point.label === symbol.glyph) && symbol.glyph !== manualPointLabel);
    if (next) setManualPointLabel(next.glyph);
  }

  function handleCanvasClick(event: MouseEvent<SVGSVGElement>) {
    const scene = currentScene();
    if ((!pointInsertMode && !textInsertMode && scene !== "mechanics") || !svgRef.current) return;
    const matrix = svgRef.current.getScreenCTM();
    if (!matrix) return;
    const point = svgRef.current.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const mapped = point.matrixTransform(matrix.inverse());
    if (scene === "mechanics" && !pointInsertMode && !textInsertMode) {
      addMechanicElementAt({ x: mapped.x, y: mapped.y });
      return;
    }
    if (textInsertMode) {
      if (!floatingTextDraft.trim()) return tell("error", "اكتب النص أولًا ثم اضغط مكانه على الرسم.");
      setFloatingTexts((current) => [...current, {
        id: crypto.randomUUID(),
        x: mapped.x,
        y: mapped.y,
        text: floatingTextDraft,
        size: Math.max(14, Math.min(80, parseArabicNumber(floatingTextSize) || 30)),
        scene,
      }]);
      tell("ok", "تمت إضافة النص.");
      return;
    }
    addManualPointAt({ x: mapped.x, y: mapped.y });
  }

  function axesOrigin() {
    const presets = {
      equal: { x: canvasWidth / 2, y: canvasHeight / 2 },
      q1: { x: 150, y: canvasHeight - 120 },
      q2: { x: canvasWidth - 150, y: canvasHeight - 120 },
      q3: { x: canvasWidth - 150, y: 120 },
      q4: { x: 150, y: 120 },
    };
    return presets[axesVariant];
  }

  function axesScale() {
    return Math.min(canvasWidth, canvasHeight) / 14;
  }

  function axesToCanvas(x: number, y: number) {
    const origin = axesOrigin();
    const scale = axesScale();
    return { x: origin.x + x * scale, y: origin.y - y * scale };
  }

  function canvasToAxes(point: { x: number; y: number }) {
    const origin = axesOrigin();
    const scale = axesScale();
    return { x: (point.x - origin.x) / scale, y: (origin.y - point.y) / scale };
  }

  function addAxesPoint() {
    const x = parseArabicNumber(axesX);
    const y = parseArabicNumber(axesY);
    if (![x, y].every(Number.isFinite)) return tell("error", "الإحداثيات لازم تكون أرقامًا صحيحة أو عشرية.");
    const mapped = axesToCanvas(x, y);
    const model = canvasToModel(mapped);
    const id = crypto.randomUUID();
    setFreePoints((current) => [...current, { id, x: model.x, y: model.y, label: axesPointLabel || `ن${toArabic(current.length + 1)}`, source: "axes" }]);
    tell("ok", "تمت إضافة نقطة بإحداثيات.");
  }

  function addFunctionGraph() {
    const from = parseArabicNumber(functionFrom);
    const to = parseArabicNumber(functionTo);
    if (![from, to].every(Number.isFinite) || from === to) return tell("error", "حدد بداية ونهاية صحيحتين للدالة.");
    setFunctionGraphs((current) => [...current, {
      id: crypto.randomUUID(),
      expression: functionExpression,
      from: functionFrom,
      to: functionTo,
      dashed: false,
    }]);
    tell("ok", "تمت إضافة رسم الدالة.");
  }

  function addMechanicElementAt(screen: { x: number; y: number }) {
    if (currentScene() !== "mechanics") return;
    setMechanicElements((current) => [...current, {
      id: crypto.randomUUID(),
      type: mechanicType,
      x: screen.x,
      y: screen.y,
      label: mechanicLabel,
      angle: mechanicAngle,
      dashed: mechanicDashed,
    }]);
    tell("ok", "تمت إضافة عنصر ميكانيكا.");
  }

  async function serializeSvg() {
    if (!svgRef.current) throw new Error("لا توجد لوحة رسم.");
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const width = Math.max(400, Math.round(parseArabicNumber(exportWidth) || 1600));
    const height = Math.round(width / ratioValue);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    try {
      const response = await fetch("/fonts/Amiri-Regular.ttf");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const style = clone.querySelector("style");
      if (style) style.textContent = `@font-face{font-family:'Amiri Math';src:url(data:font/ttf;base64,${btoa(binary)}) format('truetype');}${style.textContent}`;
    } catch {
      // The SVG stays usable with the embedded fallback stack.
    }
    return { source: new XMLSerializer().serializeToString(clone), width, height };
  }

  async function exportSvg() {
    try {
      const { source } = await serializeSvg();
      downloadBlob(new Blob([source], { type: "image/svg+xml;charset=utf-8" }), "رسم-هندسي.svg");
      tell("ok", "تم تنزيل ملف SVG.");
    } catch {
      tell("error", "تعذر تصدير SVG. حاول مرة أخرى.");
    }
  }

  async function exportPng() {
    try {
      const { source, width, height } = await serializeSvg();
      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((png) => {
          if (png) downloadBlob(png, "رسم-هندسي.png");
          URL.revokeObjectURL(url);
        }, "image/png");
      };
      image.src = url;
      tell("ok", "جارٍ تجهيز ملف PNG.");
    } catch {
      tell("error", "تعذر تصدير PNG. حاول مرة أخرى.");
    }
  }

  function clearConstructions() {
    setDiagonals([]);
    setAltitudes([]);
    setAngles([]);
    setShadings([]);
    setCircleConstructions([]);
    setManualPoints([]);
    setShadeDraft([]);
    setLabelOffsets({});
  }

  function applyTemplate(template: "rectangle-diagonal" | "triangle-altitude" | "circle-chord") {
    clearConstructions();
    if (template === "rectangle-diagonal") {
      setShapeType("rectangle");
      setValues((current) => ({ ...current, width: "٩", height: "٦" }));
      window.setTimeout(() => {
        setDiagonals([{ id: crypto.randomUUID(), a: 0, b: 2, label: "" }]);
      });
    }
    if (template === "triangle-altitude") {
      setShapeType("triangle");
      setTriangleMode("scalene");
      setValues((current) => ({ ...current, ab: "٧", bc: "٨", ca: "٦" }));
      window.setTimeout(() => {
        setAltitudes([{
          id: crypto.randomUUID(),
          source: 0,
          targetId: "edge-1",
          footLabel: DEFAULT_LABELS[3],
          mode: "internal",
          altitudeLabel: "",
          footToStartLabel: "",
          footToEndLabel: "",
        }]);
      });
    }
    if (template === "circle-chord") {
      setShapeType("circle");
      setValues((current) => ({ ...current, radius: "٤" }));
      window.setTimeout(() => {
        setCircleConstructions([
          { id: crypto.randomUUID(), type: "chord", a: 2, b: 4, label: "", footLabel: DEFAULT_LABELS[9] || "ن" },
          { id: crypto.randomUUID(), type: "tangentAltitude", a: 1, b: 3, label: "", footLabel: DEFAULT_LABELS[10] || "ن" },
        ]);
      });
    }
    tell("ok", "تم تطبيق القالب.");
  }

  const parsedLineWeight = Math.max(1.5, Math.min(9, parseArabicNumber(lineWeight) || 4));
  const parsedLabelScale = Math.max(60, Math.min(180, parseArabicNumber(labelScale) || 100)) / 100;
  const dimensionError = geometry.error || (duplicateLabels ? "كل نقطة لازم يكون لها اسم مختلف." : "");
  const activeScene = currentScene();
  const geometryScene = activeScene === "shape";
  const axesScene = activeScene === "axes";
  const mechanicsScene = activeScene === "mechanics";
  const geometryDisplayedPoints = displayedPoints.filter((point) => point.kind !== "axes");
  const activeDisplayedPoints = axesScene
    ? displayedPoints.filter((point) => point.kind === "axes")
    : geometryScene
      ? geometryDisplayedPoints
      : [];
  const activePointIds = new Set(activeDisplayedPoints.map((point) => point.id));
  const visibleFloatingTexts = floatingTexts.filter((item) => item.scene === activeScene);

  return (
    <main className="app-shell" dir="rtl">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">هـ</div>
          <div>
            <h1>مِسطرة</h1>
            <p>محرّر الرسومات الهندسية العربية</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="local-badge"><span /> يعمل محليًا</span>
          <button className="button ghost" onClick={exportSvg}>تنزيل SVG</button>
          <button className="button primary" onClick={exportPng}>تنزيل PNG</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <nav className="tabs" aria-label="أقسام المحرر">
            <button className={panel === "shape" ? "active" : ""} onClick={() => switchPanel("shape")}>الأشكال الهندسية</button>
            <button className={panel === "axes" ? "active" : ""} onClick={() => switchPanel("axes")}>محاور</button>
            <button className={panel === "mechanics" ? "active" : ""} onClick={() => switchPanel("mechanics")}>ميكانيكا</button>
            <button className={panel === "style" ? "active" : ""} onClick={() => switchPanel("style")}>التصدير</button>
          </nav>

          <div className="panel-scroll">
            {panel === "shape" && (
              <>
                <section className="control-section">
                  <div className="section-heading">
                    <div><span className="step">١</span><h2>نوع الشكل</h2></div>
                    <span className="quiet">ثنائي الأبعاد</span>
                  </div>
                  <div className="shape-picker">
                    {([
                      ["triangle", "△", "مثلث"],
                      ["rectangle", "□", "مستطيل"],
                      ["rhombus", "◇", "معين"],
                      ["trapezoid", "▱", "شبه منحرف"],
                      ["parallelogram", "▰", "متوازي أضلاع"],
                      ["circle", "○", "دائرة"],
                      ["regular", "⬡", "مضلع منتظم"],
                    ] as const).map(([type, icon, label]) => (
                      <button key={type} className={shapeType === type ? "selected" : ""} onClick={() => setShapeType(type)}>
                        <span>{icon}</span>{label}
                      </button>
                    ))}
                  </div>
                  <div className="template-row">
                    <button type="button" onClick={() => applyTemplate("triangle-altitude")}>مثلث وارتفاع</button>
                    <button type="button" onClick={() => applyTemplate("rectangle-diagonal")}>مستطيل وقطر</button>
                    <button type="button" onClick={() => applyTemplate("circle-chord")}>دائرة ووتر</button>
                  </div>
                </section>

                <section className="control-section">
                  <div className="section-heading"><div><span className="step">٢</span><h2>المقاسات الهندسية</h2></div></div>
                  {shapeType === "triangle" && (
                    <>
                      <label className="full-field"><span>وضع المثلث</span><select value={triangleMode} onChange={(event) => setTriangleMode(event.target.value as TriangleMode)}>
                        <option value="scalene">مختلف الأضلاع</option>
                        <option value="right">قائم</option>
                        <option value="obtuse">منفرج</option>
                        <option value="acute">حاد</option>
                        <option value="isosceles">متساوي الساقين</option>
                      </select></label>
                      {triangleMode === "right" && (
                        <div className="field-grid two">
                          <label><span>ضلع قائم ١</span><input value={values.ab} onChange={(event) => setValue("ab", event.target.value)} inputMode="decimal" /></label>
                          <label><span>ضلع قائم ٢</span><input value={values.bc} onChange={(event) => setValue("bc", event.target.value)} inputMode="decimal" /></label>
                        </div>
                      )}
                      {triangleMode === "isosceles" && (
                        <div className="field-grid two">
                          <label><span>طول الساق</span><input value={values.ab} onChange={(event) => setValue("ab", event.target.value)} inputMode="decimal" /></label>
                          <label><span>طول القاعدة</span><input value={values.bc} onChange={(event) => setValue("bc", event.target.value)} inputMode="decimal" /></label>
                        </div>
                      )}
                      {!["right", "isosceles"].includes(triangleMode) && (
                        <div className="field-grid three">
                          <label><span>أ ب</span><input value={values.ab} onChange={(event) => setValue("ab", event.target.value)} inputMode="decimal" /></label>
                          <label><span>ب جـ</span><input value={values.bc} onChange={(event) => setValue("bc", event.target.value)} inputMode="decimal" /></label>
                          <label><span>جـ أ</span><input value={values.ca} onChange={(event) => setValue("ca", event.target.value)} inputMode="decimal" /></label>
                        </div>
                      )}
                    </>
                  )}
                  {shapeType === "rectangle" && (
                    <div className="field-grid two">
                      <label><span>العرض</span><input value={values.width} onChange={(event) => setValue("width", event.target.value)} inputMode="decimal" /></label>
                      <label><span>الارتفاع</span><input value={values.height} onChange={(event) => setValue("height", event.target.value)} inputMode="decimal" /></label>
                    </div>
                  )}
                  {shapeType === "rhombus" && (
                    <div className="field-grid two">
                      <label><span>طول الضلع</span><input value={values.side} onChange={(event) => setValue("side", event.target.value)} inputMode="decimal" /></label>
                      <label><span>الزاوية</span><input value={values.angle} onChange={(event) => setValue("angle", event.target.value)} inputMode="decimal" /></label>
                    </div>
                  )}
                  {shapeType === "trapezoid" && (
                    <>
                      <label className="full-field"><span>نوع شبه المنحرف</span><select value={trapezoidMode} onChange={(event) => setTrapezoidMode(event.target.value as TrapezoidMode)}>
                        <option value="normal">عادي</option>
                        <option value="isosceles">متساوي الساقين</option>
                        <option value="right">قائم</option>
                      </select></label>
                      <div className="field-grid three">
                        <label><span>القاعدة العليا</span><input value={values.topBase} onChange={(event) => setValue("topBase", event.target.value)} inputMode="decimal" /></label>
                        <label><span>القاعدة السفلى</span><input value={values.bottomBase} onChange={(event) => setValue("bottomBase", event.target.value)} inputMode="decimal" /></label>
                        <label><span>الارتفاع</span><input value={values.height} onChange={(event) => setValue("height", event.target.value)} inputMode="decimal" /></label>
                      </div>
                    </>
                  )}
                  {shapeType === "parallelogram" && (
                    <div className="field-grid three">
                      <label><span>القاعدة</span><input value={values.width} onChange={(event) => setValue("width", event.target.value)} inputMode="decimal" /></label>
                      <label><span>الضلع الجانبي</span><input value={values.side} onChange={(event) => setValue("side", event.target.value)} inputMode="decimal" /></label>
                      <label><span>الزاوية</span><input value={values.angle} onChange={(event) => setValue("angle", event.target.value)} inputMode="decimal" /></label>
                    </div>
                  )}
                  {shapeType === "circle" && (
                    <>
                      <div className="field-grid two">
                        <label><span>نصف القطر</span><input value={values.radius} onChange={(event) => setValue("radius", event.target.value)} inputMode="decimal" /></label>
                      </div>
                      <div className="circle-point-panel">
                        <span>نقاط ظاهرة على المحيط</span>
                        <div className="circle-point-row">
                          {[1, 3, 5, 7].map((index) => (
                            <button key={index} type="button" className={visibleCirclePoints.includes(index) ? "active" : ""} onClick={() => toggleCirclePoint(index)}>
                              <b>+</b><small>{labelForVertex(index)}</small>
                            </button>
                          ))}
                        </div>
                        <div className="circle-point-row">
                          {[2, 4, 6, 8].map((index) => (
                            <button key={index} type="button" className={visibleCirclePoints.includes(index) ? "active" : ""} onClick={() => toggleCirclePoint(index)}>
                              <b>×</b><small>{labelForVertex(index)}</small>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {shapeType === "regular" && (
                    <div className="field-grid two">
                      <label><span>عدد الأضلاع</span><select value={values.sides} onChange={(event) => setValue("sides", event.target.value)}>{Array.from({ length: 8 }, (_, index) => index + 3).map((count) => <option key={count} value={String(count)}>{toArabic(count)}</option>)}</select></label>
                      <label><span>طول الضلع</span><input value={values.side} onChange={(event) => setValue("side", event.target.value)} inputMode="decimal" /></label>
                    </div>
                  )}
                  <div className="inline-fields">
                    <label className="select-field"><span>وحدة القياس</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option>سم</option><option>مم</option><option>م</option><option>كم</option></select></label>
                    <label className="switch-row"><input type="checkbox" checked={showDimensions} onChange={(event) => setShowDimensions(event.target.checked)} /><span className="switch" /><span>إظهار القياسات</span></label>
                  </div>
                  {dimensionError && <div className="validation error">{dimensionError}</div>}
                  {!dimensionError && <div className="validation success">الأبعاد صالحة والرسم محافظ على النسب.</div>}
                </section>

                <section className="control-section">
                  <div className="section-heading"><div><span className="step">٣</span><h2>{shapeType === "circle" ? "أسماء النقاط" : "أسماء الرؤوس"}</h2></div><span className="quiet">رموز رياضية</span></div>
                  <div className="vertex-grid">
                    {Array.from({ length: vertexCount }, (_, index) => (
                      <label key={index}>
                        <span>{shapeType === "circle" && index === 0 ? "مركز الدائرة" : `${shapeType === "circle" ? "نقطة" : "الرأس"} ${toArabic(index + 1)}`}</span>
                        <select value={vertexLabels[index] || ""} onChange={(event) => setVertexLabels((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))}>
                          {SYMBOLS.map((symbol) => <option key={symbol.key} value={symbol.glyph}>{symbol.glyph} — {symbol.name}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </section>
              </>
            )}

            {panel === "shape" && (
              <>
                {shapeType !== "circle" && (
                  <>
                    <section className="control-section construction-card">
                      <div className="section-heading"><div><span className="tool-icon">╱</span><h2>إضافة قطر</h2></div></div>
                      <div className="field-grid two">
                        <label><span>من الرأس</span><select value={diagA} onChange={(event) => setDiagA(Number(event.target.value))}>{basePoints.map((point, index) => <option key={point.id} value={index}>{point.label}</option>)}</select></label>
                        <label><span>إلى الرأس</span><select value={diagB} onChange={(event) => setDiagB(Number(event.target.value))}>{basePoints.map((point, index) => <option key={point.id} value={index}>{point.label}</option>)}</select></label>
                      </div>
                      <label className="full-field"><span>طول القطر — اختياري</span><input value={diagonalLabel} onChange={(event) => setDiagonalLabel(event.target.value)} inputMode="decimal" placeholder="مثال: ١٠" /></label>
                      <label className="switch-row inline-switch"><input type="checkbox" checked={diagonalDashed} onChange={(event) => setDiagonalDashed(event.target.checked)} /><span className="switch" /><span>قطر متقطع</span></label>
                      <button className="button wide" onClick={addDiagonal}>إضافة القطر</button>
                      {basePoints.length === 3 && <p className="hint">المثلث لا يحتوي أقطارًا؛ اختر شكلًا بأربعة رؤوس أو أكثر.</p>}
                    </section>

                    <section className="control-section construction-card">
                      <div className="section-heading"><div><span className="tool-icon">⊥</span><h2>إضافة عمود</h2></div></div>
                      <div className="segmented">
                        <button className={altMode === "internal" ? "active" : ""} onClick={() => setAltMode("internal")}>داخلي</button>
                        <button className={altMode === "external" ? "active" : ""} onClick={() => setAltMode("external")}>على الامتداد</button>
                      </div>
                      <div className="field-grid two">
                        <label><span>من الرأس</span><select value={altSource} onChange={(event) => setAltSource(Number(event.target.value))}>{basePoints.map((point, index) => <option key={point.id} value={index}>{point.label}</option>)}</select></label>
                        <label><span>{shapeType === "rectangle" ? "على القطر" : "على الخط"}</span><select value={altTargetId} onChange={(event) => setAltTargetId(event.target.value)}>{lineTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
                      </div>
                      <label className="full-field"><span>اسم قدم العمود</span><select value={footLabel} onChange={(event) => setFootLabel(event.target.value)}>{SYMBOLS.map((symbol) => <option key={symbol.key} value={symbol.glyph}>{symbol.glyph} — {symbol.name}</option>)}</select></label>
                      <div className="field-grid three">
                        <label><span>طول العمود</span><input value={altitudeLabel} onChange={(event) => setAltitudeLabel(event.target.value)} inputMode="decimal" placeholder="اختياري" /></label>
                        <label><span>من القدم للطرف الأول</span><input value={footToStartLabel} onChange={(event) => setFootToStartLabel(event.target.value)} inputMode="decimal" placeholder="اختياري" /></label>
                        <label><span>من القدم للطرف الثاني</span><input value={footToEndLabel} onChange={(event) => setFootToEndLabel(event.target.value)} inputMode="decimal" placeholder="اختياري" /></label>
                      </div>
                      <label className="switch-row inline-switch"><input type="checkbox" checked={altitudeDashed} onChange={(event) => setAltitudeDashed(event.target.checked)} /><span className="switch" /><span>العمود متقطع</span></label>
                      <button className="button wide" onClick={addAltitude}>إضافة العمود</button>
                      {shapeType === "rectangle" && !lineTargets.length && <p className="hint">في المستطيل، أضف قطرًا أولًا ثم أسقط العمود عليه.</p>}
                    </section>
                  </>
                )}

                {shapeType === "circle" && (
                  <section className="control-section construction-card">
                    <div className="section-heading"><div><span className="tool-icon">○</span><h2>إنشاءات الدائرة</h2></div></div>
                    <label className="full-field"><span>نوع الإنشاء</span><select value={circleTool} onChange={(event) => setCircleTool(event.target.value as CircleTool)}>
                      <option value="radius">نصف قطر</option>
                      <option value="diameter">قطر</option>
                      <option value="chord">وتر</option>
                      <option value="chordAltitude">عمود على وتر</option>
                      <option value="tangentAltitude">عمود على مماس</option>
                    </select></label>
                    <div className="field-grid two">
                      <label><span>{circleTool === "diameter" ? "نقطة بداية القطر" : circleTool === "tangentAltitude" ? "نقطة التماس" : "النقطة الأولى"}</span><select value={circleA} onChange={(event) => setCircleA(Number(event.target.value))}>{basePoints.slice(1).map((point, index) => <option key={point.id} value={index + 1}>{point.label}</option>)}</select></label>
                      {!["radius", "diameter", "tangentAltitude"].includes(circleTool) && <label><span>النقطة الثانية</span><select value={circleB} onChange={(event) => setCircleB(Number(event.target.value))}>{basePoints.slice(1).map((point, index) => <option key={point.id} value={index + 1}>{point.label}</option>)}</select></label>}
                    </div>
                    {circleTool === "chordAltitude" && <label className="full-field"><span>اسم قدم العمود على الوتر</span><select value={circleFootLabel} onChange={(event) => setCircleFootLabel(event.target.value)}>{SYMBOLS.map((symbol) => <option key={symbol.key} value={symbol.glyph}>{symbol.glyph} — {symbol.name}</option>)}</select></label>}
                    <label className="full-field"><span>الطول — اختياري</span><input value={circleLabel} onChange={(event) => setCircleLabel(event.target.value)} inputMode="decimal" placeholder="مثال: ٤" /></label>
                    <label className="switch-row inline-switch"><input type="checkbox" checked={circleDashed} onChange={(event) => setCircleDashed(event.target.checked)} /><span className="switch" /><span>الإنشاء متقطع</span></label>
                    <button className="button wide" onClick={addCircleConstruction}>إضافة الإنشاء</button>
                  </section>
                )}

                <section className="control-section construction-card">
                  <div className="section-heading"><div><span className="tool-icon">•</span><h2>نقطة يدوية على خط</h2></div></div>
                  <label className="switch-row inline-switch"><input type="checkbox" checked={pointInsertMode} onChange={(event) => setPointInsertEnabled(event.target.checked)} /><span className="switch" /><span>تفعيل الضغط على الرسم لإضافة نقطة</span></label>
                  <label className="full-field"><span>رمز النقطة الجديدة</span><select value={manualPointLabel} onChange={(event) => setManualPointLabel(event.target.value)}>{SYMBOLS.map((symbol) => <option key={symbol.key} value={symbol.glyph}>{symbol.glyph} — {symbol.name}</option>)}</select></label>
                  <p className="hint">اضغط قرب خط أو محيط دائرة لتثبيتها عليه، أو في أي مكان داخل الصورة لإضافة نقطة حرة.</p>
                </section>

                <section className="control-section construction-card">
                  <div className="section-heading"><div><span className="tool-icon">─</span><h2>توصيل بين نقطتين</h2></div></div>
                  <div className="field-grid two">
                    <label><span>من</span><select value={connectionA} onChange={(event) => setConnectionA(event.target.value)}>{geometryDisplayedPoints.map((point) => <option key={point.id} value={point.id}>{point.label}</option>)}</select></label>
                    <label><span>إلى</span><select value={connectionB} onChange={(event) => setConnectionB(event.target.value)}>{geometryDisplayedPoints.map((point) => <option key={point.id} value={point.id}>{point.label}</option>)}</select></label>
                  </div>
                  <label className="full-field"><span>طول/نص على التوصيل — اختياري</span><input value={connectionLabel} onChange={(event) => setConnectionLabel(event.target.value)} placeholder="مثال: ٥ سم" /></label>
                  <label className="switch-row inline-switch"><input type="checkbox" checked={connectionDashed} onChange={(event) => setConnectionDashed(event.target.checked)} /><span className="switch" /><span>خط متقطع</span></label>
                  <button className="button wide" onClick={addConnection}>إضافة التوصيل</button>
                </section>

                <section className="control-section construction-card">
                  <div className="section-heading"><div><span className="tool-icon">⌒</span><h2>قوس زاوية</h2></div></div>
                  <p className="hint strong">اختر النقاط بالترتيب؛ النقطة الوسطى هي رأس الزاوية.</p>
                  <div className="field-grid three">
                    {[{ value: angleA, set: setAngleA, label: "الأولى" }, { value: angleB, set: setAngleB, label: "الرأس" }, { value: angleC, set: setAngleC, label: "الثالثة" }].map((field) => (
                      <label key={field.label}><span>{field.label}</span><select value={field.value} onChange={(event) => field.set(event.target.value)}>{geometryDisplayedPoints.map((point) => <option key={point.id} value={point.id}>{point.label}</option>)}</select></label>
                    ))}
                  </div>
                  <label className="full-field"><span>القيمة — اتركها فارغة للحساب التلقائي، أو اكتب * كرمز</span><div className="input-suffix"><input value={angleValue} onChange={(event) => setAngleValue(event.target.value)} inputMode="decimal" placeholder="مثال: ٦٠ أو *" /><b>{angleValue.trim() === "*" ? "" : "°"}</b></div></label>
                  <button className="button wide" onClick={addAngle}>إضافة قوس الزاوية</button>
                </section>

                <section className="control-section construction-card">
                  <div className="section-heading"><div><span className="tool-icon shaded">▧</span><h2>تظليل مساحة</h2></div></div>
                  <p className="hint strong">اختَر نقاط المنطقة، وسيتم ترتيبها تلقائيًا حول المساحة.</p>
                  <div className="point-chips">
                    {geometryDisplayedPoints.map((point) => <button key={point.id} className={shadeDraft.includes(point.id) ? "active" : ""} onClick={() => toggleShadePoint(point.id)}>{point.label}</button>)}
                  </div>
                  <div className="selection-order">{shadeDraft.length ? shadeDraft.map((id) => pointMap.get(id)?.label).join(" ← ") : "لم يتم اختيار نقاط بعد"}</div>
                  <label className="full-field"><span>نمط التظليل</span><select value={shadeStyle} onChange={(event) => setShadeStyle(event.target.value as Shading["style"])}><option value="hatch">خطوط مائلة</option><option value="light">رمادي فاتح</option><option value="dark">رمادي داكن</option></select></label>
                  <button className="button wide" onClick={addShading}>تظليل المنطقة</button>
                </section>

                {(diagonals.length + altitudes.length + angles.length + shadings.length + circleConstructions.length + manualPoints.length + freePoints.filter((item) => item.source === "canvas").length + connections.length + floatingTexts.filter((item) => item.scene === "shape").length > 0) && (
                  <section className="control-section added-list">
                    <div className="section-heading"><div><h2>العناصر المضافة</h2></div></div>
                    {diagonals.map((item) => <div key={item.id}><span>قطر {labelForVertex(item.a)} {labelForVertex(item.b)}{item.label.trim() ? ` · ${toArabic(item.label)} ${unit}` : ""}</span><button onClick={() => removeDiagonal(item.id)}>×</button></div>)}
                    {altitudes.map((item) => <div key={item.id}><span>عمود من {labelForVertex(item.source)} إلى {item.footLabel}</span><button onClick={() => removeAltitude(item.id)}>×</button></div>)}
                    {circleConstructions.map((item) => <div key={item.id}><span>{item.type === "radius" ? "نصف قطر" : item.type === "diameter" ? "قطر دائرة" : item.type === "chord" ? "وتر" : item.type === "chordAltitude" ? "عمود على وتر" : "عمود على مماس"}</span><button onClick={() => setCircleConstructions((current) => current.filter((value) => value.id !== item.id))}>×</button></div>)}
                    {manualPoints.map((item) => <div key={item.id}><span>نقطة {item.label} على خط</span><button onClick={() => removeManualPoint(item.id)}>×</button></div>)}
                    {freePoints.filter((item) => item.source === "canvas").map((item) => <div key={item.id}><span>نقطة حرة {item.label}</span><button onClick={() => removeManualPoint(item.id)}>×</button></div>)}
                    {connections.map((item) => <div key={item.id}><span>توصيل {pointMap.get(item.a)?.label} {pointMap.get(item.b)?.label}</span><button onClick={() => setConnections((current) => current.filter((value) => value.id !== item.id))}>×</button></div>)}
                    {floatingTexts.filter((item) => item.scene === "shape").map((item) => <div key={item.id}><span>نص: {renderMathText(item.text)}</span><button onClick={() => setFloatingTexts((current) => current.filter((value) => value.id !== item.id))}>×</button></div>)}
                    {angles.map((item) => <div key={item.id}><span>زاوية {pointMap.get(item.a)?.label}{pointMap.get(item.b)?.label}{pointMap.get(item.c)?.label}</span><button onClick={() => setAngles((current) => current.filter((value) => value.id !== item.id))}>×</button></div>)}
                    {shadings.map((item) => <div key={item.id}><span>منطقة مظللة</span><button onClick={() => setShadings((current) => current.filter((value) => value.id !== item.id))}>×</button></div>)}
                  </section>
                )}
              </>
            )}

            {panel === "axes" && (
              <>
                <section className="control-section">
                  <div className="section-heading"><div><span className="step">١</span><h2>المحاور والشبكة</h2></div></div>
                  <label className="switch-row inline-switch"><input type="checkbox" checked={showAxes} onChange={(event) => setShowAxes(event.target.checked)} /><span className="switch" /><span>إظهار المحاور</span></label>
                  <div className="field-grid two">
                    <label><span>النمط</span><select value={axesMode} onChange={(event) => setAxesMode(event.target.value as "grid" | "plain")}><option value="grid">شبكة بإحداثيات</option><option value="plain">محاور فقط</option></select></label>
                    <label><span>نوع المحاور</span><select value={axesVariant} onChange={(event) => setAxesVariant(event.target.value as typeof axesVariant)}><option value="equal">متساوية</option><option value="q1">الربع الأول أكبر</option><option value="q2">الربع الثاني أكبر</option><option value="q3">الربع الثالث أكبر</option><option value="q4">الربع الرابع أكبر</option></select></label>
                  </div>
                </section>
                <section className="control-section construction-card">
                  <div className="section-heading"><div><span className="tool-icon">⨯</span><h2>نقطة بإحداثيات</h2></div></div>
                  <div className="field-grid three">
                    <label><span>الرمز</span><input value={axesPointLabel} onChange={(event) => setAxesPointLabel(event.target.value)} /></label>
                    <label><span>س</span><input value={axesX} onChange={(event) => setAxesX(event.target.value)} inputMode="decimal" /></label>
                    <label><span>ص</span><input value={axesY} onChange={(event) => setAxesY(event.target.value)} inputMode="decimal" /></label>
                  </div>
                  <button className="button wide" onClick={addAxesPoint}>إضافة النقطة</button>
                </section>
                <section className="control-section construction-card">
                  <div className="section-heading"><div><span className="tool-icon">ƒ</span><h2>رسم دالة</h2></div></div>
                  <label className="full-field"><span>الدالة بدلالة x</span><input value={functionExpression} onChange={(event) => setFunctionExpression(event.target.value)} placeholder="مثال: x^2 أو sin(x)" /></label>
                  <div className="field-grid two">
                    <label><span>من</span><input value={functionFrom} onChange={(event) => setFunctionFrom(event.target.value)} inputMode="decimal" /></label>
                    <label><span>إلى</span><input value={functionTo} onChange={(event) => setFunctionTo(event.target.value)} inputMode="decimal" /></label>
                  </div>
                  <button className="button wide" onClick={addFunctionGraph}>إضافة الدالة</button>
                </section>
              </>
            )}

            {panel === "mechanics" && (
              <>
                <section className="control-section">
                  <div className="section-heading"><div><span className="step">١</span><h2>عناصر ميكانيكا</h2></div></div>
                  <label className="full-field"><span>نوع العنصر</span><select value={mechanicType} onChange={(event) => setMechanicType(event.target.value as MechanicElement["type"])}>
                    <option value="force">سهم قوة</option>
                    <option value="couple">عزم ازدواج</option>
                    <option value="block">جسم مستطيل</option>
                    <option value="plane">مستوى أفقي/مائل</option>
                    <option value="pulley">بكرة وكتلة</option>
                    <option value="ladder">سلم مستند</option>
                  </select></label>
                  <div className="field-grid two">
                    <label><span>الرمز/النص</span><input value={mechanicLabel} onChange={(event) => setMechanicLabel(event.target.value)} /></label>
                    <label><span>الزاوية</span><input value={mechanicAngle} onChange={(event) => setMechanicAngle(event.target.value)} inputMode="decimal" /></label>
                  </div>
                  <label className="switch-row inline-switch"><input type="checkbox" checked={mechanicDashed} onChange={(event) => setMechanicDashed(event.target.checked)} /><span className="switch" /><span>خط متقطع</span></label>
                  <p className="hint">اضغط على مكان داخل الصورة لإضافة العنصر.</p>
                </section>
              </>
            )}

            {panel === "style" && (
              <>
                <section className="control-section">
                  <div className="section-heading"><div><span className="step">١</span><h2>مقاس الصورة</h2></div></div>
                  <label className="full-field"><span>الصورة المراد تصديرها</span><select value={exportTarget} onChange={(event) => setExportTarget(event.target.value as SceneKey)}>
                    <option value="shape">الأشكال الهندسية</option>
                    <option value="axes">المحاور والشبكة</option>
                    <option value="mechanics">الميكانيكا والرسم الحر</option>
                  </select></label>
                  <div className="ratio-picker">
                    {["1:1", "4:3", "16:9", "9:16"].map((item) => <button key={item} className={ratio === item ? "active" : ""} onClick={() => setRatio(item)}>{toArabic(item)}</button>)}
                  </div>
                  <label className="full-field"><span>عرض ملف PNG بالبكسل</span><input value={exportWidth} onChange={(event) => setExportWidth(event.target.value)} inputMode="numeric" /></label>
                  <div className="export-size">الناتج: {toArabic(Math.max(400, Math.round(parseArabicNumber(exportWidth) || 1600)))} × {toArabic(Math.round(Math.max(400, parseArabicNumber(exportWidth) || 1600) / ratioValue))} بكسل</div>
                </section>
                <section className="control-section">
                  <div className="section-heading"><div><span className="step">٢</span><h2>الطبقات والمظهر</h2></div></div>
                  <div className="layer-toggles">
                    <label className="switch-row"><input type="checkbox" checked={showConstructions} onChange={(event) => setShowConstructions(event.target.checked)} /><span className="switch" /><span>الإنشاءات</span></label>
                    <label className="switch-row"><input type="checkbox" checked={showShading} onChange={(event) => setShowShading(event.target.checked)} /><span className="switch" /><span>التظليل</span></label>
                    <label className="switch-row"><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} /><span className="switch" /><span>الرموز</span></label>
                    <label className="switch-row"><input type="checkbox" checked={showAngles} onChange={(event) => setShowAngles(event.target.checked)} /><span className="switch" /><span>الزوايا</span></label>
                  </div>
                  <div className="field-grid two">
                    <label><span>سُمك الخط</span><input value={lineWeight} onChange={(event) => setLineWeight(event.target.value)} inputMode="decimal" /></label>
                    <label><span>حجم الرموز ٪</span><input value={labelScale} onChange={(event) => setLabelScale(event.target.value)} inputMode="numeric" /></label>
                  </div>
                  <label className="full-field"><span>تحريك رمز نقطة</span><select value={labelOffsetPoint} onChange={(event) => setLabelOffsetPoint(event.target.value)}>{activeDisplayedPoints.map((point) => <option key={point.id} value={point.id}>{point.label}</option>)}</select></label>
                  <div className="field-grid two">
                    <label><span>إزاحة أفقية</span><input value={toArabic(labelOffsets[labelOffsetPoint]?.x || 0)} onChange={(event) => setLabelOffsets((current) => ({ ...current, [labelOffsetPoint]: { x: parseArabicNumber(event.target.value) || 0, y: current[labelOffsetPoint]?.y || 0 } }))} inputMode="decimal" /></label>
                    <label><span>إزاحة رأسية</span><input value={toArabic(labelOffsets[labelOffsetPoint]?.y || 0)} onChange={(event) => setLabelOffsets((current) => ({ ...current, [labelOffsetPoint]: { x: current[labelOffsetPoint]?.x || 0, y: parseArabicNumber(event.target.value) || 0 } }))} inputMode="decimal" /></label>
                  </div>
                </section>
                <section className="control-section">
                  <div className="section-heading"><div><span className="step">٣</span><h2>النصوص</h2></div></div>
                  <label className="full-field"><span>نص أعلى الشكل</span><input value={topText} onChange={(event) => setTopText(event.target.value)} placeholder="اكتب عنوانًا اختياريًا" /></label>
                  <label className="full-field"><span>نص أسفل الشكل</span><input value={bottomText} onChange={(event) => setBottomText(event.target.value)} placeholder="اكتب ملاحظة اختيارية" /></label>
                  <label className="full-field"><span>نص حر داخل الرسم — يدعم رموز LaTeX الأساسية</span><input value={floatingTextDraft} onChange={(event) => setFloatingTextDraft(event.target.value)} placeholder="مثال: F=ma أو \\frac{1}{2}mv^2" /></label>
                  <div className="field-grid two">
                    <label><span>حجم النص</span><input value={floatingTextSize} onChange={(event) => setFloatingTextSize(event.target.value)} inputMode="numeric" /></label>
                    <label className="switch-row inline-switch"><input type="checkbox" checked={textInsertMode} onChange={(event) => setTextInsertEnabled(event.target.checked)} /><span className="switch" /><span>اضغط لوضع النص</span></label>
                  </div>
                </section>
                <section className="control-section">
                  <div className="section-heading"><div><span className="step">٤</span><h2>CSV batch</h2></div></div>
                  <label className="full-field"><span>كل صف صورة: title,shape,ratio</span><textarea value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder={"مسألة ١,triangle,4:3\nمسألة ٢,circle,1:1"} /></label>
                  <button className="button wide" onClick={() => {
                    const scenes = csvText.split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
                    setBatchScenes(scenes);
                    tell("ok", `تمت قراءة ${toArabic(scenes.length)} صفوف.`);
                  }}>قراءة CSV</button>
                  {batchScenes.length > 0 && <div className="selection-order">{batchScenes.map((row, index) => <button key={index} type="button" onClick={() => {
                    const [title, shape, nextRatio] = row.split(",").map((item) => item?.trim());
                    if (title) setTopText(title);
                    if (["triangle", "rectangle", "circle", "regular", "rhombus", "trapezoid", "parallelogram"].includes(shape)) setShapeType(shape as ShapeType);
                    if (["1:1", "4:3", "16:9", "9:16"].includes(nextRatio)) setRatio(nextRatio);
                  }}>{toArabic(index + 1)}</button>)}</div>}
                </section>
                <section className="export-card">
                  <div className="export-icon">↓</div>
                  <h2>الصورة جاهزة</h2>
                  <p>خلفية بيضاء، خطوط سوداء، ورموز عربية مضمنة.</p>
                  <button className="button primary wide" onClick={exportPng}>تنزيل PNG</button>
                  <button className="button ghost wide" onClick={exportSvg}>تنزيل SVG</button>
                </section>
              </>
            )}
          </div>
        </aside>

        <section className="canvas-area">
          <div className="canvas-toolbar">
            <div><strong>معاينة مباشرة</strong><span>{toArabic(ratio)} · خلفية بيضاء</span></div>
            <div className="legend"><span><i className="solid-line" /> حدود</span><span><i className="dash-line" /> امتداد</span></div>
          </div>
          <div className="artboard-wrap">
            <div className="artboard" style={{ aspectRatio: String(ratioValue) }}>
              <svg ref={svgRef} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} role="img" aria-label="الرسم الهندسي الناتج" onClick={handleCanvasClick} style={{ cursor: pointInsertMode || textInsertMode || mechanicsScene ? "crosshair" : "default" }}>
                <defs>
                  <style>{`
                    @font-face{font-family:'Amiri Math';src:url('/fonts/Amiri-Regular.ttf') format('truetype');}
                    .geometry-line{stroke:#111;stroke-width:${parsedLineWeight};stroke-linecap:round;stroke-linejoin:round;fill:none;vector-effect:non-scaling-stroke}
                    .construction-line{stroke:#111;stroke-width:${Math.max(1.5, parsedLineWeight - 1)};stroke-linecap:round;fill:none;vector-effect:non-scaling-stroke}
                    .extension-line{stroke:#111;stroke-width:${Math.max(1.2, parsedLineWeight - 1.5)};stroke-dasharray:10 8;stroke-linecap:round;fill:none;vector-effect:non-scaling-stroke}
                    .vertex-label,.measure-label,.angle-label,.canvas-title{font-family:'Amiri Math','SF Arabic',serif;fill:#090909;text-anchor:middle;dominant-baseline:middle}
                    .vertex-label{font-size:${42 * parsedLabelScale}px}.measure-label{font-size:${29 * parsedLabelScale}px}.angle-label{font-size:${26 * parsedLabelScale}px}.canvas-title{font-size:34px}
                    .right-mark{stroke:#111;stroke-width:2.5;fill:none;vector-effect:non-scaling-stroke}
                    .point-dot{fill:#111;stroke:#fff;stroke-width:2;vector-effect:non-scaling-stroke}
                    .grid-line{stroke:#d9d9d9;stroke-width:1;vector-effect:non-scaling-stroke}
                    .axis-line{stroke:#111;stroke-width:3;vector-effect:non-scaling-stroke}
                    .mechanics-shape{stroke:#111;stroke-width:${Math.max(1.5, parsedLineWeight - 1)};fill:none;vector-effect:non-scaling-stroke}
                  `}</style>
                  <pattern id="hatch" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="13" stroke="#555" strokeWidth="2" /></pattern>
                  <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#111" /></marker>
                </defs>
                <rect width={canvasWidth} height={canvasHeight} fill="#fff" />
                {topText && <text className="canvas-title" x={canvasWidth / 2} y={44}>{topText}</text>}
                {bottomText && <text className="canvas-title" x={canvasWidth / 2} y={canvasHeight - 32}>{bottomText}</text>}

                {axesScene && showAxes && (
                  <g>
                    {axesMode === "grid" && Array.from({ length: 25 }, (_, index) => index - 12).map((value) => {
                      const verticalA = axesToCanvas(value, -12);
                      const verticalB = axesToCanvas(value, 12);
                      const horizontalA = axesToCanvas(-12, value);
                      const horizontalB = axesToCanvas(12, value);
                      return <g key={value}><line className="grid-line" x1={verticalA.x} y1={verticalA.y} x2={verticalB.x} y2={verticalB.y} /><line className="grid-line" x1={horizontalA.x} y1={horizontalA.y} x2={horizontalB.x} y2={horizontalB.y} /></g>;
                    })}
                    {(() => {
                      const o = axesOrigin();
                      return <g><line className="axis-line" x1={40} y1={o.y} x2={canvasWidth - 40} y2={o.y} /><line className="axis-line" x1={o.x} y1={canvasHeight - 40} x2={o.x} y2={40} /><text className="measure-label" x={canvasWidth - 55} y={o.y - 22}>س</text><text className="measure-label" x={o.x + 24} y={52}>ص</text></g>;
                    })()}
                    {functionGraphs.map((graph) => {
                      const from = parseArabicNumber(graph.from);
                      const to = parseArabicNumber(graph.to);
                      const points = Array.from({ length: 90 }, (_, index) => {
                        const x = from + ((to - from) * index) / 89;
                        const y = evaluateExpression(graph.expression, x);
                        return y === null ? null : axesToCanvas(x, y);
                      }).filter(Boolean) as Array<{ x: number; y: number }>;
                      return points.length > 1 ? <polyline key={graph.id} className={graph.dashed ? "extension-line" : "construction-line"} points={points.map((point) => `${point.x},${point.y}`).join(" ")} /> : null;
                    })}
                  </g>
                )}

                {geometryScene && geometry.circle && (() => {
                  const center = basePoints[geometry.circle.center];
                  const radiusPoint = basePoints[geometry.circle.radiusPoint];
                  if (!center || !radiusPoint) return null;
                  const mappedCenter = screenPoint(center);
                  const mappedRadius = screenPoint(radiusPoint);
                  const radius = Math.hypot(mappedRadius.x - mappedCenter.x, mappedRadius.y - mappedCenter.y);
                  return <circle className="geometry-line" cx={mappedCenter.x} cy={mappedCenter.y} r={radius} />;
                })()}

                {geometryScene && showConstructions && computedCircleConstructions.map((item) => {
                  const center = screenPoint(item.center);
                  const first = screenPoint(item.first);
                  const second = screenPoint(item.second);
                  if (item.type === "radius") {
                    return <line key={item.id} className={item.dashed ? "extension-line" : "construction-line"} x1={center.x} y1={center.y} x2={first.x} y2={first.y} />;
                  }
                  if (item.type === "diameter" || item.type === "chord") {
                    return <line key={item.id} className={item.dashed ? "extension-line" : "construction-line"} x1={first.x} y1={first.y} x2={second.x} y2={second.y} />;
                  }
                  if (item.type === "chordAltitude" && item.foot) {
                    const foot = screenPoint(item.foot);
                    const chordVx = first.x - foot.x;
                    const chordVy = first.y - foot.y;
                    const chordLength = Math.hypot(chordVx, chordVy) || 1;
                    const altVx = center.x - foot.x;
                    const altVy = center.y - foot.y;
                    const altLength = Math.hypot(altVx, altVy) || 1;
                    const mark = 15;
                    const rightPoints = `${foot.x + (chordVx / chordLength) * mark},${foot.y + (chordVy / chordLength) * mark} ${foot.x + (chordVx / chordLength) * mark + (altVx / altLength) * mark},${foot.y + (chordVy / chordLength) * mark + (altVy / altLength) * mark} ${foot.x + (altVx / altLength) * mark},${foot.y + (altVy / altLength) * mark}`;
                    return <g key={item.id}><line className={item.dashed ? "extension-line" : "construction-line"} x1={first.x} y1={first.y} x2={second.x} y2={second.y} /><line className={item.dashed ? "extension-line" : "construction-line"} x1={center.x} y1={center.y} x2={foot.x} y2={foot.y} /><polyline className="right-mark" points={rightPoints} /></g>;
                  }
                  const radiusVx = first.x - center.x;
                  const radiusVy = first.y - center.y;
                  const length = Math.hypot(radiusVx, radiusVy) || 1;
                  const tangentX = -radiusVy / length;
                  const tangentY = radiusVx / length;
                  const tangentSize = 82;
                  const p1 = { x: first.x - tangentX * tangentSize, y: first.y - tangentY * tangentSize };
                  const p2 = { x: first.x + tangentX * tangentSize, y: first.y + tangentY * tangentSize };
                  const radiusUx = (center.x - first.x) / length;
                  const radiusUy = (center.y - first.y) / length;
                  const mark = 15;
                  const rightPoints = `${first.x + tangentX * mark},${first.y + tangentY * mark} ${first.x + tangentX * mark + radiusUx * mark},${first.y + tangentY * mark + radiusUy * mark} ${first.x + radiusUx * mark},${first.y + radiusUy * mark}`;
                  return <g key={item.id}><line className="extension-line" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} /><line className={item.dashed ? "extension-line" : "construction-line"} x1={center.x} y1={center.y} x2={first.x} y2={first.y} /><polyline className="right-mark" points={rightPoints} /></g>;
                })}

                {geometryScene && showShading && shadings.map((shading) => {
                  const points = shading.pointIds.map((id) => pointMap.get(id)).filter(Boolean) as Point[];
                  return <polygon key={shading.id} points={points.map((point) => { const mapped = screenPoint(point); return `${mapped.x},${mapped.y}`; }).join(" ")} fill={shading.style === "hatch" ? "url(#hatch)" : shading.style === "light" ? "#e4e4e4" : "#aaa"} />;
                })}

                {geometryScene && geometry.edges.map((edge, index) => {
                  const start = basePoints[edge.a];
                  const end = basePoints[edge.b];
                  if (!start || !end) return null;
                  const a = screenPoint(start);
                  const b = screenPoint(end);
                  return <line key={index} className="geometry-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                })}

                {geometryScene && shapeType === "circle" && displayedPoints.filter((point) => point.kind === "vertex").map((point) => {
                  const mapped = screenPoint(point);
                  const radius = point.id === "v-0" ? 5.5 : 4.5;
                  return <circle key={`dot-${point.id}`} className="point-dot" cx={mapped.x} cy={mapped.y} r={radius} />;
                })}

                {geometryScene && showConstructions && diagonals.map((diagonal) => {
                  const a = screenPoint(basePoints[diagonal.a]);
                  const b = screenPoint(basePoints[diagonal.b]);
                  return <line key={diagonal.id} className={diagonal.dashed ? "extension-line" : "construction-line"} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                })}

                {geometryScene && showConstructions && computedAltitudes.map((altitude) => {
                  const source = screenPoint(altitude.sourcePoint);
                  const foot = screenPoint(altitude.foot);
                  const start = screenPoint(altitude.start);
                  const end = screenPoint(altitude.end);
                  const extensionEnd = altitude.t < 0 ? start : end;
                  const baseAnchor = altitude.mode === "external"
                    ? extensionEnd
                    : (altitude.t > 0.5 ? start : end);
                  const baseVx = baseAnchor.x - foot.x;
                  const baseVy = baseAnchor.y - foot.y;
                  const baseLength = Math.hypot(baseVx, baseVy) || 1;
                  const altVx = source.x - foot.x;
                  const altVy = source.y - foot.y;
                  const altLength = Math.hypot(altVx, altVy) || 1;
                  const bx = baseVx / baseLength;
                  const by = baseVy / baseLength;
                  const ax = altVx / altLength;
                  const ay = altVy / altLength;
                  const mark = 16;
                  const rightPoints = `${foot.x + bx * mark},${foot.y + by * mark} ${foot.x + bx * mark + ax * mark},${foot.y + by * mark + ay * mark} ${foot.x + ax * mark},${foot.y + ay * mark}`;
                  return (
                    <g key={altitude.id}>
                      {altitude.mode === "external" && <line className="extension-line" x1={extensionEnd.x} y1={extensionEnd.y} x2={foot.x} y2={foot.y} />}
                      <line className={altitude.dashed ? "extension-line" : "construction-line"} x1={source.x} y1={source.y} x2={foot.x} y2={foot.y} />
                      <polyline className="right-mark" points={rightPoints} />
                    </g>
                  );
                })}

                {showConstructions && !mechanicsScene && connections.map((connection) => {
                  const start = pointMap.get(connection.a);
                  const end = pointMap.get(connection.b);
                  if (!start || !end || !activePointIds.has(start.id) || !activePointIds.has(end.id)) return null;
                  const a = screenPoint(start);
                  const b = screenPoint(end);
                  return <line key={connection.id} className={connection.dashed ? "extension-line" : "construction-line"} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
                })}

                {mechanicsScene && mechanicElements.map((item) => {
                  const angle = (parseArabicNumber(item.angle) || 0) * Math.PI / 180;
                  const dx = Math.cos(angle);
                  const dy = Math.sin(angle);
                  if (item.type === "force") {
                    return <g key={item.id}><line className={item.dashed ? "extension-line" : "construction-line"} x1={item.x} y1={item.y} x2={item.x + dx * 100} y2={item.y - dy * 100} markerEnd="url(#arrow)" /><text className="measure-label" x={item.x + dx * 116} y={item.y - dy * 116}>{renderMathText(item.label)}</text></g>;
                  }
                  if (item.type === "couple") {
                    return <g key={item.id}><path className={item.dashed ? "extension-line" : "construction-line"} d={`M ${item.x - 34} ${item.y} A 34 34 0 1 1 ${item.x + 34} ${item.y}`} markerEnd="url(#arrow)" /><text className="measure-label" x={item.x} y={item.y}>{renderMathText(item.label || "+")}</text></g>;
                  }
                  if (item.type === "block") return <g key={item.id}><rect className="mechanics-shape" x={item.x - 48} y={item.y - 28} width={96} height={56} /><text className="measure-label" x={item.x} y={item.y}>{renderMathText(item.label)}</text></g>;
                  if (item.type === "plane") return <g key={item.id} transform={`rotate(${-parseArabicNumber(item.angle) || 0} ${item.x} ${item.y})`}><line className={item.dashed ? "extension-line" : "geometry-line"} x1={item.x - 110} y1={item.y} x2={item.x + 110} y2={item.y} /><text className="measure-label" x={item.x} y={item.y - 30}>{renderMathText(item.label)}</text></g>;
                  if (item.type === "pulley") return <g key={item.id}><circle className="mechanics-shape" cx={item.x} cy={item.y} r={28} /><line className="construction-line" x1={item.x} y1={item.y + 28} x2={item.x} y2={item.y + 98} /><rect className="mechanics-shape" x={item.x - 24} y={item.y + 98} width={48} height={42} /><text className="measure-label" x={item.x} y={item.y + 126}>{renderMathText(item.label)}</text></g>;
                  return <g key={item.id} transform={`rotate(${-parseArabicNumber(item.angle) || -55} ${item.x} ${item.y})`}><line className="geometry-line" x1={item.x - 80} y1={item.y} x2={item.x + 80} y2={item.y} /><line className="construction-line" x1={item.x - 70} y1={item.y - 10} x2={item.x - 70} y2={item.y + 10} /><line className="construction-line" x1={item.x + 70} y1={item.y - 10} x2={item.x + 70} y2={item.y + 10} /><text className="measure-label" x={item.x} y={item.y - 28}>{renderMathText(item.label)}</text></g>;
                })}

                {geometryScene && showAngles && angles.map((mark) => {
                  const drawing = angleDrawing(mark);
                  if (!drawing) return null;
                  return <g key={mark.id}>{drawing.rightPoints ? <polyline className="right-mark" points={drawing.rightPoints} /> : <path className="construction-line" d={drawing.path} />}<text className="angle-label" x={drawing.labelX} y={drawing.labelY}>{drawing.label}</text></g>;
                })}

                {geometryScene && showConstructions && diagonals.map((diagonal) => segmentLabel(basePoints[diagonal.a], basePoints[diagonal.b], diagonal.label, `diag-label-${diagonal.id}`, 33))}

                {geometryScene && showConstructions && computedCircleConstructions.map((item) => {
                  if (item.type === "radius" || item.type === "tangentAltitude") return segmentLabel(item.center, item.first, item.label, `circle-label-${item.id}`, 30);
                  if (item.type === "chordAltitude" && item.foot) return segmentLabel(item.center, item.foot, item.label, `circle-label-${item.id}`, 30);
                  return segmentLabel(item.first, item.second, item.label, `circle-label-${item.id}`, 30);
                })}

                {geometryScene && showConstructions && computedAltitudes.flatMap((altitude) => [
                  segmentLabel(altitude.sourcePoint, altitude.foot, altitude.altitudeLabel, `alt-label-${altitude.id}`, 30),
                  segmentLabel(altitude.foot, altitude.start, altitude.footToStartLabel, `alt-start-label-${altitude.id}`, 30),
                  segmentLabel(altitude.foot, altitude.end, altitude.footToEndLabel, `alt-end-label-${altitude.id}`, 30),
                ])}

                {showConstructions && !mechanicsScene && connections.map((connection) => {
                  const start = pointMap.get(connection.a);
                  const end = pointMap.get(connection.b);
                  return start && end && activePointIds.has(start.id) && activePointIds.has(end.id) ? segmentLabel(start, end, connection.label, `connection-label-${connection.id}`, 30) : null;
                })}

                {activeDisplayedPoints.filter((point) => point.kind !== "vertex").map((point) => {
                  const mapped = screenPoint(point);
                  return <circle key={`dot-${point.id}`} className="point-dot" cx={mapped.x} cy={mapped.y} r={4.5} />;
                })}

                {visibleFloatingTexts.map((item) => <text key={item.id} className="canvas-title" x={item.x} y={item.y} style={{ fontSize: item.size }}>{renderMathText(item.text)}</text>)}

                {geometryScene && showDimensions && geometry.edges.map((edge, index) => {
                  const start = basePoints[edge.a];
                  const end = basePoints[edge.b];
                  if (!start || !end) return null;
                  const a = screenPoint(start);
                  const b = screenPoint(end);
                  const modelMid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
                  const awayX = modelMid.x - centroid.x;
                  const awayY = -(modelMid.y - centroid.y);
                  const awayLength = Math.hypot(awayX, awayY) || 1;
                  const hasInternalFoot = computedAltitudes.some((altitude) => altitude.target.kind === "edge" && altitude.target.index === index && altitude.mode === "internal");
                  const offset = hasInternalFoot ? 64 : 29;
                  const x = (a.x + b.x) / 2 + (awayX / awayLength) * offset;
                  const y = (a.y + b.y) / 2 + (awayY / awayLength) * offset;
                  let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
                  if (angle > 90 || angle < -90) angle += 180;
                  return <text key={index} className="measure-label" x={x} y={y} transform={`rotate(${angle} ${x} ${y})`}>{toArabic(sideMeasurement(index))} {unit}</text>;
                })}

                {geometryScene && showDimensions && geometry.circle && segmentLabel(basePoints[geometry.circle.center], basePoints[geometry.circle.radiusPoint], values.radius, "circle-radius-label", 26)}

                {showLabels && activeDisplayedPoints.map((point) => {
                  const mapped = screenPoint(point);
                  const reference = point.kind === "vertex" ? centroid : computedAltitudes.find((item) => item.foot.id === point.id)?.sourcePoint || centroid;
                  let dx = point.x - reference.x;
                  let dy = -(point.y - reference.y);
                  const length = Math.hypot(dx, dy) || 1;
                  dx = (dx / length) * 29;
                  dy = (dy / length) * 29;
                  if (shapeType === "circle" && point.id === "v-0") {
                    dx = 0;
                    dy = -34;
                  }
                  const customOffset = labelOffsets[point.id] || { x: 0, y: 0 };
                  return <text key={point.id} className="vertex-label" x={mapped.x + dx + customOffset.x} y={mapped.y + dy + customOffset.y}>{point.label}</text>;
                })}
              </svg>
              {geometryScene && geometry.error && <div className="canvas-error"><strong>لا يمكن رسم الشكل</strong><span>{geometry.error}</span></div>}
            </div>
          </div>
          <div className="canvas-status">
            <span><b>{toArabic(activeDisplayedPoints.length)}</b> نقاط ظاهرة</span>
            <span><b>{toArabic(geometryScene ? diagonals.length + altitudes.length + circleConstructions.length + connections.filter((item) => activePointIds.has(item.a) && activePointIds.has(item.b)).length : axesScene ? functionGraphs.length + connections.filter((item) => activePointIds.has(item.a) && activePointIds.has(item.b)).length : mechanicElements.length)}</b> عناصر مرسومة</span>
            <span><b>{toArabic(geometryScene ? shadings.length : visibleFloatingTexts.length)}</b> {geometryScene ? "مناطق مظللة" : "نصوص حرة"}</span>
          </div>
        </section>
      </section>

      {notice && <div className={`toast ${notice.type}`} role="status"><span>{notice.type === "ok" ? "✓" : "!"}</span>{notice.text}</div>}
    </main>
  );
}
