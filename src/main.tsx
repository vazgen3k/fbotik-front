import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleOff,
  ClipboardList,
  Clock3,
  Download,
  FileJson,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  ListChecks,
  Pause,
  Play,
  RefreshCcw,
  Send,
  Settings2,
  ShieldCheck,
  Upload,
  Wand2,
  Warehouse,
  XCircle,
} from "lucide-react";
import readXlsxFile, { readSheetNames } from "read-excel-file";
import "./styles.css";

type RawCell = string | number | boolean | Date | null | undefined;

type ShipmentRecord = {
  id: string;
  sourceRow: number;
  group: string;
  article: string;
  sku: string;
  category: string;
  stock: number;
  destinations: Record<string, number>;
  shipQty: number;
  balanceAfter: number;
  manager: string;
  selected: boolean;
  issues: string[];
};

type ProductDraft = {
  offer_id: string;
  name: string;
  source_sku: string;
  category: string;
  price: string;
  old_price: string;
  vat: string;
  currency_code: "RUB";
  description_category_id: number | null;
  type_id: number | null;
  dimension_unit: "mm";
  weight_unit: "g";
  width: number;
  height: number;
  depth: number;
  weight: number;
  attributes: Array<{
    id: number;
    complex_id: number;
    values: Array<{ dictionary_value_id: number; value: string }>;
  }>;
  shipment: {
    total_qty: number;
    balance_after: number;
    destinations: Record<string, number>;
  };
  warnings: string[];
};

type QueueJob = {
  id: string;
  type: "product-import" | "supply-draft";
  endpoint: string;
  title: string;
  requests: number;
  items: number;
  rate: number;
  status: "waiting" | "running" | "done" | "paused";
  etaSeconds: number;
  payloadPreview: unknown;
};

type ApiCheck = {
  state: "idle" | "checking" | "connected" | "error";
  message: string;
  limits?: {
    daily_create?: { limit?: number; usage?: number };
    daily_update?: { limit?: number; usage?: number };
    total?: { limit?: number; usage?: number };
  };
};

type WarehouseOption = {
  id: number;
  name: string;
  address: string;
};

type TimeslotOption = {
  from: string;
  to: string;
};

type BulkJobResult = {
  code: string;
  name: string;
  cluster_id: number;
  state: string;
  message: string;
  draft_id?: number;
  order_id?: number;
  warehouse?: WarehouseOption;
};

type BulkJob = {
  job_id: string;
  state: string;
  total: number;
  completed: number;
  failed: number;
  results: BulkJobResult[];
};

type OrderSnapshot = {
  order_id: number;
  state: string;
  state_updated_date?: string;
  drop_off_warehouse?: WarehouseOption & { warehouse_id?: number };
};

const DEFAULT_WAREHOUSE_NAME = "МОСКВА_10097";

const DESTINATION_CLUSTERS: Record<string, { id: number | null; name: string }> = {
  "МСК": { id: 4039, name: "Москва, МО и Дальние регионы" },
  "СПБ": { id: 4007, name: "Санкт-Петербург и СЗО" },
  "САМ": { id: 4042, name: "Самара" },
  "КАЗ": { id: 4041, name: "Казань" },
  "САРАТ": { id: 4049, name: "Саратов" },
  "ОР": { id: 4069, name: "Оренбург" },
  "УФА": { id: 4040, name: "Уфа" },
  "КРАС": { id: 4065, name: "Краснодар" },
  "РОСТ": { id: 4071, name: "Ростов" },
  "ТВ": { id: 4072, name: "Тверь" },
  "ЯРОС": { id: 4051, name: "Ярославль" },
  "МАХА": { id: 4077, name: "Махачкала" },
  "НВН": { id: 4076, name: "Невинномысск" },
  "ВРН": { id: 4036, name: "Воронеж" },
  "ПЕР": { id: 4070, name: "Пермь" },
  "ЕКБ": { id: 4066, name: "Екатеринбург" },
  "НСК": { id: 4067, name: "Новосибирск" },
  "ОМСК": { id: 4068, name: "Омск" },
  "ТЮМ": { id: 4046, name: "Тюмень" },
  "ЯРСК": { id: 4043, name: "Красноярск" },
  "ХАБ": { id: 4002, name: "Дальний Восток" },
  "КЛГ": { id: 4004, name: "Калининград" },
  "РБ": { id: 4001, name: "Республика Беларусь" },
  "АСТ": { id: 4075, name: "Астана" },
  "АЛМ": { id: 4074, name: "Алматы" },
};

const SAMPLE_HEADERS = [
  null,
  "Группа",
  " Артикул",
  "SKU",
  "Категория",
  "Остаток",
  "МСК",
  "СПБ",
  "САМ",
  "КАЗ",
  " САРАТ",
  "ОР",
  "УФА",
  "КРАС",
  "РОСТ",
  "ТВ",
  "ЯРОС",
  "МАХА",
  "НВН",
  "ВРН",
  "ПЕР",
  "ЕКБ",
  "НСК",
  "ОМСК",
  "ТЮМ",
  "ЯРСК",
  "ХАБ",
  "КЛГ",
  "РБ",
  "АСТ",
  "АЛМ",
  "Грузим",
  "Остаток после отгрузки",
  "Комментарии для себя",
  "Дата\nСборки",
  "Менеджер",
];

const SAMPLE_ROWS = [
  [
    470,
    "Автотовары",
    "Цурикава_рога_фиолет",
    5093461376,
    null,
    108,
    43,
    9,
    6,
    6,
    5,
    2,
    8,
    9,
    6,
    2,
    7,
    6,
    7,
    7,
    4,
    14,
    54,
    10,
    13,
    null,
    null,
    null,
    2,
    null,
    null,
    220,
    -112,
    null,
    null,
    null,
  ],
  [
    464,
    "Автотовары",
    "Цурикава_Черная_рога",
    4905649653,
    null,
    565,
    353,
    121,
    102,
    169,
    124,
    48,
    "135 нет",
    99,
    114,
    27,
    143,
    50,
    63,
    170,
    90,
    144,
    105,
    25,
    76,
    71,
    56,
    46,
    "144 нет",
    33,
    null,
    2229,
    -1664,
    null,
    null,
    null,
  ],
  [
    465,
    "Автотовары",
    "Цурикава_розовая_рога",
    4906297362,
    null,
    300,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    0,
    300,
    null,
    null,
    "Андрей",
  ],
];

const API_NOTES = [
  {
    label: "/v3/product/import",
    detail:
      "Создание или обновление карточек. В один запрос кладём до 100 товаров, а браузер только готовит JSON.",
  },
  {
    label: "/v1/draft/direct/create",
    detail:
      "Черновики поставки живут 30 минут. Для них нужен медленный лимит: 2 запроса в минуту, 50 в час, 500 в день.",
  },
  {
    label: "Очередь на сервере",
    detail:
      "Client-Id и Api-Key остаются на backend. Клиент передаёт пачку заданий, сервер сам дозирует запросы.",
  },
];

const DESTINATION_STOP_HEADERS = [
  "грузим",
  "остаток после отгрузки",
  "комментарии для себя",
  "дата сборки",
  "менеджер",
];

const normalizeHeader = (value: RawCell) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const toNumber = (value: RawCell) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const cleanText = (value: RawCell) =>
  String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeSku = (value: RawCell) => {
  const text = cleanText(value).replace(/\.0$/, "");
  return /^\d{6,15}$/.test(text) ? text : "";
};

const detectColumnOffset = (
  row: RawCell[],
  groupIndex: number,
  articleIndex: number,
  skuIndex: number,
) => {
  for (let offset = 0; offset <= 4; offset += 1) {
    if (
      normalizeSku(row[skuIndex + offset]) &&
      cleanText(row[groupIndex + offset]) &&
      cleanText(row[articleIndex + offset])
    ) {
      return offset;
    }
  }
  return 0;
};

const makeOfferId = (record: ShipmentRecord) =>
  `${record.group || "ozon"}-${record.sku}`
    .toLowerCase()
    .replace(/[^a-zа-я0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

const detectHeaderRow = (rows: RawCell[][]) => {
  let best = 0;
  let bestScore = 0;
  rows.slice(0, 20).forEach((row, index) => {
    const headers = row.map(normalizeHeader);
    const score =
      Number(headers.includes("sku")) +
      Number(headers.some((h) => h.includes("артикул"))) +
      Number(headers.includes("грузим")) +
      Number(headers.includes("остаток"));
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
};

const parseRows = (rows: RawCell[][], sourceName: string): ShipmentRecord[] => {
  const headerIndex = detectHeaderRow(rows);
  const headers = rows[headerIndex] ?? [];
  const normalized = headers.map(normalizeHeader);
  const findIndex = (checks: string[]) =>
    normalized.findIndex((h) => checks.some((check) => h === check || h.includes(check)));

  const groupIndex = findIndex(["группа"]);
  const articleIndex = findIndex(["артикул"]);
  const skuIndex = findIndex(["sku"]);
  const categoryIndex = findIndex(["категория"]);
  const stockIndex = findIndex(["остаток"]);
  const shipIndex = findIndex(["грузим"]);
  const balanceIndex = findIndex(["остаток после отгрузки"]);
  const managerIndex = findIndex(["менеджер"]);

  const destinationIndexes = headers
    .map((header, index) => ({ header: cleanText(header), index }))
    .filter(({ header, index }) => {
      const h = normalizeHeader(header);
      if (!header || index <= stockIndex) return false;
      if (DESTINATION_STOP_HEADERS.some((stop) => h.includes(stop))) return false;
      return index < (shipIndex > -1 ? shipIndex : headers.length);
    });

  return rows
    .slice(headerIndex + 1)
    .map((row, offset) => {
      const excelRow = headerIndex + offset + 2;
      const sourceRow = toNumber(row[0]) > 0 ? toNumber(row[0]) : excelRow;
      const columnOffset = detectColumnOffset(row, groupIndex, articleIndex, skuIndex);
      const cell = (index: number) => row[index > -1 ? index + columnOffset : index];
      const destinations: Record<string, number> = {};
      destinationIndexes.forEach(({ header, index }) => {
        const qty = toNumber(cell(index));
        if (qty > 0) destinations[header] = qty;
      });

      const article = cleanText(cell(articleIndex));
      const sku = normalizeSku(cell(skuIndex));
      const shipQty =
        shipIndex > -1 && toNumber(cell(shipIndex)) > 0
          ? toNumber(cell(shipIndex))
          : Object.values(destinations).reduce((sum, qty) => sum + qty, 0);
      const stock = toNumber(cell(stockIndex));
      const balanceAfter =
        balanceIndex > -1 && cell(balanceIndex) !== null && cell(balanceIndex) !== undefined
          ? toNumber(cell(balanceIndex))
          : stock - shipQty;
      const issues: string[] = [];
      if (!sku) issues.push("SKU должен содержать от 6 до 15 цифр");
      if (!article) issues.push("Нет артикула");
      if (shipQty <= 0) issues.push("Нет количества к отгрузке");
      if (balanceAfter < 0) issues.push("Отгрузка больше остатка");
      if (!cleanText(cell(categoryIndex))) issues.push("Не указана категория");

      return {
        id: `${sourceName}-${sourceRow}-${sku || article}`,
        sourceRow,
        group: cleanText(cell(groupIndex)),
        article,
        sku,
        category: cleanText(cell(categoryIndex)),
        stock,
        destinations,
        shipQty,
        balanceAfter,
        manager: cleanText(cell(managerIndex)),
        selected: shipQty > 0 && Boolean(sku && article),
        issues,
      };
    })
    .filter((record) => record.sku || record.article || record.shipQty > 0);
};

const buildProductDraft = (record: ShipmentRecord): ProductDraft => {
  const warnings = [...record.issues];
  if (!record.category) warnings.push("Для реальной карточки нужен description_category_id и type_id OZON");
  if (record.balanceAfter < 0) warnings.push("Остаток после отгрузки отрицательный");

  return {
    offer_id: makeOfferId(record),
    name: cleanText(record.article),
    source_sku: record.sku,
    category: record.group || record.category || "Без группы",
    price: "0",
    old_price: "0",
    vat: "0",
    currency_code: "RUB",
    description_category_id: null,
    type_id: null,
    dimension_unit: "mm",
    weight_unit: "g",
    width: 100,
    height: 30,
    depth: 100,
    weight: 100,
    attributes: [
      {
        id: 9048,
        complex_id: 0,
        values: [{ dictionary_value_id: 0, value: cleanText(record.article) }],
      },
    ],
    shipment: {
      total_qty: record.shipQty,
      balance_after: record.balanceAfter,
      destinations: record.destinations,
    },
    warnings,
  };
};

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const formatSeconds = (seconds: number) => {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} сек`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);
  return rest ? `${minutes} мин ${rest} сек` : `${minutes} мин`;
};

const downloadJson = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const dateOnly = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatTimeslot = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const parseCsv = (text: string): RawCell[][] => {
  const delimiter = text.includes(";") ? ";" : ",";
  const rows: RawCell[][] = [];
  let cell = "";
  let row: RawCell[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((items) => items.some((item) => cleanText(item)));
};

const AppHeader = () => (
  <section className="topbar">
    <div>
      <p className="eyebrow">OZON Seller API</p>
      <h1>Отгрузки и черновики карточек</h1>
    </div>
    <div className="status-strip" aria-label="Ограничения API">
      <span>
        <ShieldCheck size={16} /> Браузер не шлёт запросы в OZON
      </span>
      <span>
        <Gauge size={16} /> Лимит клиента: до 50 req/s
      </span>
      <span>
        <Clock3 size={16} /> Черновики поставки: 2/min
      </span>
    </div>
  </section>
);

const postLiveAction = async (action: string, values: Record<string, unknown>) => {
  const response = await fetch("/local-api/ozon/live", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...values }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const validationMessage = Array.isArray(result.detail)
      ? result.detail
          .map((item: { loc?: Array<string | number>; msg?: string }) => {
            const field = item.loc?.filter((part) => part !== "body").join(".");
            return `${field || "поле"}: ${item.msg || "некорректное значение"}`;
          })
          .join("; ")
      : "";
    throw new Error(
      result.message || result.data?.message || validationMessage || `Запрос завершился с HTTP ${response.status}`,
    );
  }
  return result.data;
};

function App() {
  const [records, setRecords] = useState<ShipmentRecord[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [productRate, setProductRate] = useState(40);
  const [productBatchSize, setProductBatchSize] = useState(100);
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [apiCheck, setApiCheck] = useState<ApiCheck>({
    state: "idle",
    message: "Проверка ещё не запускалась.",
  });
  const [liveDestination, setLiveDestination] = useState("МСК");
  const [liveDraftId, setLiveDraftId] = useState<number | null>(null);
  const [liveWarehouses, setLiveWarehouses] = useState<WarehouseOption[]>([]);
  const [liveWarehouseId, setLiveWarehouseId] = useState("");
  const [liveTimeslots, setLiveTimeslots] = useState<TimeslotOption[]>([]);
  const [liveTimeslotFrom, setLiveTimeslotFrom] = useState("");
  const [liveSupplyDraftId, setLiveSupplyDraftId] = useState<number | null>(null);
  const [liveOrderId, setLiveOrderId] = useState<number | null>(null);
  const [cancelOperationId, setCancelOperationId] = useState("");
  const [createdOrderIds, setCreatedOrderIds] = useState<number[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("ozon-crm-created-order-ids") ?? "[]");
      return Array.isArray(stored) ? stored.map(Number).filter(Number.isInteger) : [];
    } catch {
      return [];
    }
  });
  const [preferredWarehouseName, setPreferredWarehouseName] = useState(
    () => localStorage.getItem("fbotik-preferred-warehouse") || DEFAULT_WAREHOUSE_NAME,
  );
  const [bulkJob, setBulkJob] = useState<BulkJob | null>(null);
  const [orderSnapshots, setOrderSnapshots] = useState<Record<number, OrderSnapshot>>(() => {
    try {
      return JSON.parse(localStorage.getItem("fbotik-order-snapshots") ?? "{}");
    } catch {
      return {};
    }
  });
  const [liveBusy, setLiveBusy] = useState("");
  const [liveMessage, setLiveMessage] = useState("Начните с выбранной строки и направления.");
  const [liveError, setLiveError] = useState("");
  const [activeHint, setActiveHint] = useState(
    "Загрузите Excel или CSV. После разбора файла откроется рабочая область.",
  );
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!queueRunning) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }

    timerRef.current = window.setInterval(() => {
      setQueue((jobs) => {
        const next = [...jobs];
        const activeIndex = next.findIndex((job) => job.status === "running");
        if (activeIndex > -1) {
          next[activeIndex] = { ...next[activeIndex], status: "done", etaSeconds: 0 };
        }
        const waitingIndex = next.findIndex((job) => job.status === "waiting");
        if (waitingIndex > -1) {
          next[waitingIndex] = { ...next[waitingIndex], status: "running" };
          return next;
        }
        setQueueRunning(false);
        return next;
      });
    }, 900);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [queueRunning]);

  const selectedRecords = useMemo(() => records.filter((record) => record.selected), [records]);
  const selectedRecord = records.find((record) => record.id === selectedId) ?? records[0];
  const productDrafts = useMemo(
    () => selectedRecords.map(buildProductDraft),
    [selectedRecords],
  );
  const selectedDraft = selectedRecord ? buildProductDraft(selectedRecord) : null;
  const destinationOptions = useMemo(
    () =>
      Object.entries(selectedRecord?.destinations ?? {})
        .filter(([code, qty]) => qty > 0 && DESTINATION_CLUSTERS[code])
        .map(([code, qty]) => ({ code, qty, ...DESTINATION_CLUSTERS[code] })),
    [selectedRecord],
  );
  const liveDestinationData = destinationOptions.find((item) => item.code === liveDestination);
  const selectedTimeslot = liveTimeslots.find((item) => item.from === liveTimeslotFrom);

  useEffect(() => {
    if (!destinationOptions.some((item) => item.code === liveDestination)) {
      setLiveDestination(destinationOptions[0]?.code ?? "");
    }
    setLiveDraftId(null);
    setLiveWarehouses([]);
    setLiveWarehouseId("");
    setLiveTimeslots([]);
    setLiveTimeslotFrom("");
    setLiveSupplyDraftId(null);
    setLiveOrderId(null);
    setCancelOperationId("");
  }, [selectedRecord?.id]);

  useEffect(() => {
    localStorage.setItem("ozon-crm-created-order-ids", JSON.stringify(createdOrderIds));
  }, [createdOrderIds]);

  useEffect(() => {
    localStorage.setItem("fbotik-preferred-warehouse", preferredWarehouseName);
  }, [preferredWarehouseName]);

  useEffect(() => {
    localStorage.setItem("fbotik-order-snapshots", JSON.stringify(orderSnapshots));
  }, [orderSnapshots]);

  const totals = useMemo(() => {
    const destinationTotals: Record<string, number> = {};
    selectedRecords.forEach((record) => {
      Object.entries(record.destinations).forEach(([destination, qty]) => {
        destinationTotals[destination] = (destinationTotals[destination] ?? 0) + qty;
      });
    });
    return {
      selected: selectedRecords.length,
      qty: selectedRecords.reduce((sum, record) => sum + record.shipQty, 0),
      issues: selectedRecords.reduce((sum, record) => sum + record.issues.length, 0),
      destinations: Object.keys(destinationTotals).length,
      destinationTotals,
    };
  }, [selectedRecords]);

  const bulkClusters = useMemo(
    () =>
      Object.entries(totals.destinationTotals)
        .map(([code]) => {
          const destination = DESTINATION_CLUSTERS[code];
          if (!destination?.id) return null;
          const items = selectedRecords
            .map((record) => ({
              sku: Number(record.sku),
              quantity: record.destinations[code] ?? 0,
            }))
            .filter((item) => Number.isSafeInteger(item.sku) && item.sku > 0 && item.quantity > 0);
          return items.length
            ? { code, name: destination.name, clusterId: destination.id, items }
            : null;
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [selectedRecords, totals.destinationTotals],
  );
  const unsupportedDestinations = Object.keys(totals.destinationTotals).filter(
    (code) => !DESTINATION_CLUSTERS[code]?.id,
  );

  const plannedProductRequests = Math.ceil(productDrafts.length / productBatchSize);
  const productEta = plannedProductRequests / Math.max(1, productRate);
  const supplyRequests = Math.max(1, totals.destinations);
  const supplyEta = Math.ceil(supplyRequests / 2) * 60;

  const loadRows = (rows: RawCell[][], name: string) => {
    const parsed = parseRows(rows, name);
    setRecords(parsed);
    setSourceName(name);
    setSelectedId(parsed[0]?.id ?? "");
    setQueue([]);
    setQueueRunning(false);
    setActiveHint(
      `Файл разобран: ${parsed.length} строк. Строки с количеством к отгрузке отмечены для подготовки черновиков.`,
    );
  };

  const handleFile = async (file: File) => {
    if (file.name.toLowerCase().endsWith(".csv")) {
      const rows = parseCsv(await file.text());
      loadRows(rows, `${file.name}: CSV`);
      return;
    }

    const sheetNames = await readSheetNames(file);
    const preferredSheet =
      sheetNames.find((sheetName) => sheetName.toLowerCase().includes("отгруз")) ?? sheetNames[0];
    const rows = (await readXlsxFile(file, { sheet: preferredSheet })) as RawCell[][];
    loadRows(rows, `${file.name}: ${preferredSheet}`);
  };

  const toggleRecord = (id: string) => {
    setRecords((current) =>
      current.map((record) =>
        record.id === id ? { ...record, selected: !record.selected } : record,
      ),
    );
  };

  const selectOnlyProblemRows = () => {
    setRecords((current) =>
      current.map((record) => ({ ...record, selected: record.issues.length > 0 })),
    );
    setActiveHint("Выбраны только строки с замечаниями. Их удобно разобрать перед постановкой в очередь.");
  };

  const checkOzonApi = async () => {
    setApiCheck({ state: "checking", message: "Проверяем ключи через локальный backend…" });
    setActiveHint("Выполняем один читающий запрос к OZON. Товары и поставки не изменяются.");

    try {
      const response = await fetch("/local-api/ozon/check", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message || result.data?.message || `OZON вернул HTTP ${response.status}`);
      }
      setApiCheck({
        state: "connected",
        message: "Авторизация работает. Получены живые лимиты кабинета.",
        limits: result.data,
      });
      setActiveHint("Связь с настоящим OZON API подтверждена читающим запросом.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось проверить API.";
      setApiCheck({ state: "error", message });
      setActiveHint(`Проверка API не прошла: ${message}`);
    }
  };

  const liveRequest = async (action: string, values: Record<string, unknown>) => {
    setLiveBusy(action);
    setLiveError("");
    try {
      return await postLiveAction(action, values);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Операция не выполнена.";
      setLiveError(message);
      throw error;
    } finally {
      setLiveBusy("");
    }
  };

  const createLiveDraft = async () => {
    if (!selectedRecord || !liveDestinationData?.id) return;
    const numericSku = Number(selectedRecord.sku);
    if (!Number.isSafeInteger(numericSku) || numericSku <= 0) {
      setLiveError("Не удалось определить числовой SKU. Проверьте соответствие колонок в Excel.");
      return;
    }
    const confirmed = window.confirm(
      `Создать технический черновик?\n\nSKU: ${selectedRecord.sku}\nНаправление: ${liveDestinationData.name}\nКоличество: ${liveDestinationData.qty} шт.\n\nВ ЛК он ещё не появится.`,
    );
    if (!confirmed) return;
    try {
      const data = await liveRequest("create-draft", {
        sku: numericSku,
        quantity: liveDestinationData.qty,
        clusterId: liveDestinationData.id,
      });
      setLiveDraftId(Number(data.draft_id));
      setLiveMessage(`Технический черновик ${data.draft_id} создан. Теперь запросите доступные склады.`);
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const loadLiveWarehouses = async () => {
    if (!liveDraftId) return;
    try {
      const data = await liveRequest("draft-info", { draftId: liveDraftId });
      const warehouses = (data.clusters?.[0]?.warehouses ?? [])
        .filter((item: any) => item.availability_status?.state === "FULL_AVAILABLE")
        .map((item: any) => ({
          id: Number(item.storage_warehouse.warehouse_id),
          name: String(item.storage_warehouse.name),
          address: String(item.storage_warehouse.address ?? ""),
        }));
      setLiveWarehouses(warehouses);
      const preferred = warehouses.find(
        (warehouse: WarehouseOption) => warehouse.name.toLocaleUpperCase() === preferredWarehouseName.toLocaleUpperCase(),
      );
      setLiveWarehouseId(String(preferred?.id ?? ""));
      setLiveMessage(
        preferred
          ? `Основной ПВЗ ${preferredWarehouseName} выбран автоматически.`
          : `ПВЗ ${preferredWarehouseName} недоступен. Выберите другой склад вручную.`,
      );
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const loadLiveTimeslots = async () => {
    if (!liveDraftId || !liveDestinationData?.id || !liveWarehouseId) return;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() + 7);
    const dateTo = new Date(dateFrom);
    dateTo.setDate(dateTo.getDate() + 7);
    try {
      const data = await liveRequest("timeslots", {
        draftId: liveDraftId,
        clusterId: liveDestinationData.id,
        warehouseId: Number(liveWarehouseId),
        dateFrom: dateOnly(dateFrom),
        dateTo: dateOnly(dateTo),
      });
      const timeslots: TimeslotOption[] = (
        data.result?.drop_off_warehouse_timeslots?.days ?? []
      ).flatMap((day: any) =>
        (day.timeslots ?? []).map((item: any) => ({
          from: String(item.from_in_timezone),
          to: String(item.to_in_timezone),
        })),
      );
      setLiveTimeslots(timeslots);
      setLiveTimeslotFrom(timeslots[0]?.from ?? "");
      setLiveMessage(`Получено ${timeslots.length} окон на период через неделю.`);
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const createVisibleSupply = async () => {
    if (!liveDraftId || !liveDestinationData?.id || !liveWarehouseId || !selectedTimeslot) return;
    const warehouse = liveWarehouses.find((item) => String(item.id) === liveWarehouseId);
    const confirmed = window.confirm(
      `Создать живую заявку, видимую в ЛК?\n\nСклад: ${warehouse?.name}\nВремя: ${formatTimeslot(selectedTimeslot.from)}–${new Date(selectedTimeslot.to).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}\n\nПосле создания её можно отменить, пока статус OZON это допускает.`,
    );
    if (!confirmed) return;
    try {
      const data = await liveRequest("create-supply", {
        draftId: liveDraftId,
        clusterId: liveDestinationData.id,
        warehouseId: Number(liveWarehouseId),
        timeslot: {
          from_in_timezone: selectedTimeslot.from,
          to_in_timezone: selectedTimeslot.to,
        },
      });
      setLiveSupplyDraftId(Number(data.draft_id ?? liveDraftId));
      setLiveMessage("Создание заявки запущено. Нажмите «Проверить появление», чтобы получить order_id.");
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const checkVisibleSupply = async () => {
    if (!liveSupplyDraftId) return;
    try {
      const data = await liveRequest("supply-status", { draftId: liveSupplyDraftId });
      if (data.order_id) {
        const orderId = Number(data.order_id);
        setLiveOrderId(orderId);
        setCreatedOrderIds((current) =>
          current.includes(orderId) ? current : [...current, orderId],
        );
      }
      setLiveMessage(
        data.status === "SUCCESS"
          ? `Заявка создана и должна быть видна в ЛК. order_id: ${data.order_id}.`
          : `Текущий статус создания: ${data.status}.`,
      );
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const rememberBulkOrders = (job: BulkJob) => {
    const orderIds = job.results
      .map((result) => Number(result.order_id))
      .filter((orderId) => Number.isSafeInteger(orderId) && orderId > 0);
    if (orderIds.length) {
      setCreatedOrderIds((current) => Array.from(new Set([...current, ...orderIds])));
    }
  };

  const startBulkSupplies = async () => {
    if (!bulkClusters.length) return;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() + 7);
    const dateTo = new Date(dateFrom);
    dateTo.setDate(dateTo.getDate() + 7);
    const confirmed = window.confirm(
      `Создать заявки по всем доступным кластерам?\n\nКластеров: ${bulkClusters.length}\nПВЗ: ${preferredWarehouseName}\nПервый таймслот: начиная через 7 дней\n\nBackend поставит запросы в очередь с лимитом OZON 2/min.`,
    );
    if (!confirmed) return;
    try {
      const data = await liveRequest("start-bulk-supplies", {
        requestId: crypto.randomUUID(),
        preferredWarehouseName,
        dateFrom: dateOnly(dateFrom),
        dateTo: dateOnly(dateTo),
        clusters: bulkClusters,
      });
      setBulkJob(data);
      setLiveMessage(`Массовая очередь запущена: ${bulkClusters.length} кластеров.`);
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const syncOrders = async (silent = false) => {
    if (!createdOrderIds.length) return;
    try {
      const data = silent
        ? await postLiveAction("sync-orders", { orderIds: createdOrderIds.slice(0, 50) })
        : await liveRequest("sync-orders", { orderIds: createdOrderIds.slice(0, 50) });
      const snapshots = Object.fromEntries(
        (data.orders ?? []).map((order: OrderSnapshot) => [Number(order.order_id), order]),
      );
      setOrderSnapshots((current) => ({ ...current, ...snapshots }));
      if (!silent) setLiveMessage(`Обновлено заявок из OZON: ${Object.keys(snapshots).length}.`);
    } catch {
      if (!silent) setLiveError("Не удалось обновить статусы заявок из OZON.");
    }
  };

  const cancelVisibleSupply = async () => {
    if (!liveOrderId) return;
    if (!window.confirm(`Отменить живую заявку ${liveOrderId}?`)) return;
    try {
      const data = await liveRequest("cancel-supply", { orderId: liveOrderId });
      setCancelOperationId(String(data.operation_id));
      setLiveMessage("Отмена запущена. Нажмите «Проверить отмену» через несколько секунд.");
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const checkCancellation = async () => {
    if (!cancelOperationId) return;
    try {
      const data = await liveRequest("cancel-status", { operationId: cancelOperationId });
      setLiveMessage(
        data.status === "SUCCESS" && data.result?.is_order_cancelled
          ? `Заявка ${liveOrderId} отменена.`
          : `Статус отмены: ${data.status}.`,
      );
      if (data.status === "SUCCESS" && data.result?.is_order_cancelled) {
        void syncOrders(true);
      }
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const cancelAllCreatedSupplies = async () => {
    if (!createdOrderIds.length) return;
    const confirmed = window.confirm(
      `Отменить все заявки, созданные этой CRM?\n\norder_id: ${createdOrderIds.join(", ")}\n\nДругие заявки кабинета затронуты не будут.`,
    );
    if (!confirmed) return;
    try {
      const data = await liveRequest("cancel-supplies", { orderIds: createdOrderIds });
      const accepted = (data.results ?? []).filter((item: any) => item.ok).length;
      const failed = (data.results ?? []).filter((item: any) => !item.ok).length;
      setLiveMessage(
        failed
          ? `Отмена запущена для ${accepted} заявок, ошибок запуска: ${failed}.`
          : `Отмена запущена для всех заявок: ${accepted}.`,
      );
    } catch {
      // Error is already shown in the live panel.
    }
  };

  const prepareQueue = () => {
    const productChunks = chunk(productDrafts, productBatchSize);
    const productJobs: QueueJob[] = productChunks.map((items, index) => ({
      id: `product-${index + 1}`,
      type: "product-import",
      endpoint: "POST /v3/product/import",
      title: `Карточки ${index * productBatchSize + 1}-${index * productBatchSize + items.length}`,
      requests: 1,
      items: items.length,
      rate: productRate,
      status: "waiting",
      etaSeconds: 1 / Math.max(1, productRate),
      payloadPreview: { items },
    }));

    const supplyJobs: QueueJob[] = Object.entries(totals.destinationTotals).map(
      ([destination, qty], index) => ({
        id: `supply-${index + 1}`,
        type: "supply-draft",
        endpoint: "POST /v1/draft/direct/create",
        title: `Черновик поставки: ${DESTINATION_CLUSTERS[destination]?.name ?? destination}`,
        requests: 1,
        items: qty,
        rate: 2 / 60,
        status: "waiting",
        etaSeconds: 30 * (index + 1),
        payloadPreview: {
          cluster_info: {
            macrolocal_cluster_id: null,
            items: selectedRecords
              .filter((record) => record.destinations[destination] > 0)
              .map((record) => ({
                sku: Number(record.sku),
                quantity: record.destinations[destination],
              })),
          },
          deletion_sku_mode: "PARTIAL",
        },
      }),
    );

    setQueue([...productJobs, ...supplyJobs]);
    setQueueRunning(false);
    setActiveHint(
      "Очередь подготовлена локально. В production браузер должен отправить этот пакет на backend, а backend уже дозирует запросы к OZON.",
    );
  };

  useEffect(() => {
    if (!bulkJob || ["completed", "completed_with_errors", "cancelled"].includes(bulkJob.state)) return;
    const timer = window.setInterval(() => {
      void postLiveAction("bulk-job-status", { jobId: bulkJob.job_id })
        .then((job: BulkJob) => {
          setBulkJob(job);
          rememberBulkOrders(job);
        })
        .catch((error) => setLiveError(error instanceof Error ? error.message : "Не удалось обновить очередь."));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [bulkJob?.job_id, bulkJob?.state]);

  useEffect(() => {
    if (!createdOrderIds.length) return;
    void syncOrders(true);
    const timer = window.setInterval(() => void syncOrders(true), 60_000);
    return () => window.clearInterval(timer);
  }, [createdOrderIds.join(",")]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const readSummary = () => ({
      sourceName,
      rows: records.length,
      selectedRows: selectedRecords.length,
      selectedQty: totals.qty,
      productRequests: plannedProductRequests,
      supplyDraftRequests: supplyRequests,
    });

    void Promise.resolve(
      context.registerTool(
        {
          name: "read_ozon_import_summary",
          title: "Read OZON import summary",
          description: "Return the visible import summary and planned request counts.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: readSummary,
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    void Promise.resolve(
      context.registerTool(
        {
          name: "stage_ozon_queue",
          title: "Stage OZON queue",
          description:
            "Stage the same simulated server queue that the visible Prepare queue button creates.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: () => {
            prepareQueue();
            return { status: "staged", ...readSummary() };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [
    sourceName,
    records.length,
    selectedRecords.length,
    totals.qty,
    plannedProductRequests,
    supplyRequests,
  ]);

  if (!records.length) {
    return (
      <main className="app-shell">
        <AppHeader />
        <section className="panel import-gate">
          <div className="import-gate-copy">
            <FileSpreadsheet size={28} />
            <div>
              <p className="eyebrow">Источник данных</p>
              <h2>Загрузите таблицу отгрузок</h2>
              <p>Выберите Excel или CSV, чтобы открыть рабочую область и продолжить.</p>
            </div>
          </div>
          <label className="drop-zone import-gate-drop">
            <Upload size={28} />
            <span>Выбрать Excel или CSV</span>
            <small>.xlsx, .xls или .csv</small>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>
          <p className="action-hint">
            Файл читается локально в браузере. После загрузки откроется таблица и действия с отгрузками.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <AppHeader />

      <section className="workspace-grid">
        <aside className="panel controls-panel">
          <div className="panel-title">
            <FileSpreadsheet size={20} />
            <div>
              <h2>Источник</h2>
              <p className="source-name" title={sourceName}>{sourceName}</p>
            </div>
          </div>

          <label className="drop-zone">
            <Upload size={24} />
            <span>Загрузить Excel или CSV</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>
          <p className="action-hint">Читаем файл локально в браузере и ищем лист с отгрузками.</p>

          <div className={`api-check ${apiCheck.state}`}>
            <div className="panel-title compact">
              <KeyRound size={18} />
              <h2>Настоящий OZON API</h2>
            </div>
            <button
              className="action-button secondary"
              onClick={() => void checkOzonApi()}
              disabled={apiCheck.state === "checking"}
            >
              <ShieldCheck size={18} />
              {apiCheck.state === "checking" ? "Проверяем…" : "Проверить подключение"}
            </button>
            <p className="api-check-message">{apiCheck.message}</p>
            {apiCheck.limits && (
              <dl className="api-limits">
                <div>
                  <dt>Создание сегодня</dt>
                  <dd>{apiCheck.limits.daily_create?.usage ?? 0} / {apiCheck.limits.daily_create?.limit ?? "—"}</dd>
                </div>
                <div>
                  <dt>Обновление сегодня</dt>
                  <dd>{apiCheck.limits.daily_update?.usage ?? 0} / {apiCheck.limits.daily_update?.limit ?? "—"}</dd>
                </div>
                <div>
                  <dt>Ассортимент</dt>
                  <dd>{apiCheck.limits.total?.usage ?? 0} / {apiCheck.limits.total?.limit ?? "—"}</dd>
                </div>
              </dl>
            )}
          </div>
          <p className="action-hint">
            Делает один безопасный запрос лимитов. Создание карточек здесь намеренно отключено.
          </p>

          <div className="settings-block">
            <div className="panel-title compact">
              <Settings2 size={18} />
              <h2>Лимиты очереди</h2>
            </div>
            <label>
              <span>Запросов в секунду</span>
              <input
                type="range"
                min="1"
                max="50"
                value={productRate}
                onChange={(event) => setProductRate(Number(event.target.value))}
              />
              <strong>{productRate}/сек</strong>
            </label>
            <p className="action-hint">Ставим ниже лимита 50/сек, чтобы backend имел запас.</p>

            <label>
              <span>Товаров в батче</span>
              <input
                type="number"
                min="1"
                max="100"
                value={productBatchSize}
                onChange={(event) =>
                  setProductBatchSize(Math.min(100, Math.max(1, Number(event.target.value))))
                }
              />
            </label>
            <p className="action-hint">Для `/v3/product/import` держим максимум 100 товаров на запрос.</p>
          </div>

          <button className="action-button" onClick={prepareQueue} disabled={!selectedRecords.length}>
            <Wand2 size={18} />
            Собрать очередь
          </button>
          <p className="action-hint">
            Создаём задания для backend-очереди. Никаких ключей и запросов к OZON на клиенте.
          </p>

          <div className="activity-box">
            <h2>Что сейчас делаем</h2>
            <p>{activeHint}</p>
          </div>
        </aside>

        <section className="panel main-panel">
          <div className="kpi-grid">
            <div>
              <span>Строк</span>
              <strong>{records.length}</strong>
            </div>
            <div>
              <span>Выбрано</span>
              <strong>{totals.selected}</strong>
            </div>
            <div>
              <span>Штук к отгрузке</span>
              <strong>{totals.qty}</strong>
            </div>
            <div className={totals.issues ? "warn" : "ok"}>
              <span>Замечаний</span>
              <strong>{totals.issues}</strong>
            </div>
          </div>

          <div className="toolbar">
            <button
              className="icon-text"
              onClick={() => {
                setRecords((current) => current.map((record) => ({ ...record, selected: true })));
                setActiveHint("Выбраны все строки. Перед отправкой лучше проверить замечания.");
              }}
            >
              <CheckCircle2 size={17} /> Выбрать все
            </button>
            <button className="icon-text" onClick={selectOnlyProblemRows}>
              <AlertTriangle size={17} /> Только с замечаниями
            </button>
            <button
              className="icon-text"
              onClick={() => {
                setRecords((current) =>
                  current.map((record) => ({
                    ...record,
                    selected: record.issues.length === 0 && record.shipQty > 0,
                  })),
                );
                setActiveHint("Выбраны только готовые строки без замечаний и с количеством к отгрузке.");
              }}
            >
              <ListChecks size={17} /> Только готовые
            </button>
            <button
              className="icon-text"
              onClick={() => {
                setRecords((current) => current.map((record) => ({ ...record, selected: false })));
                setActiveHint("Выбор снят со всех строк. В очередь ничего не попадёт.");
              }}
              disabled={!selectedRecords.length}
            >
              <CircleOff size={17} /> Снять выбор
            </button>
            <button
              className="icon-text"
              onClick={() => {
                setRecords((current) =>
                  current.map((record) => ({ ...record, selected: !record.selected })),
                );
                setActiveHint("Выбор инвертирован: отмеченные строки сняты, остальные выбраны.");
              }}
              disabled={!records.length}
            >
              <RefreshCcw size={17} /> Инвертировать
            </button>
            <button
              className="icon-text"
              onClick={() => downloadJson({ items: productDrafts }, "ozon-product-import-draft.json")}
              disabled={!productDrafts.length}
            >
              <Download size={17} /> JSON карточек
            </button>
          </div>
          <p className="action-hint under-toolbar">
            Таблица показывает, какие строки попадут в подготовку. Строки с отрицательным остатком лучше разобрать до отправки.
          </p>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Вкл.</th>
                  <th>Строка</th>
                  <th>Группа</th>
                  <th>Артикул</th>
                  <th>SKU</th>
                  <th>Остаток</th>
                  <th>Грузим</th>
                  <th>После</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 80).map((record) => (
                  <tr
                    key={record.id}
                    className={`${record.id === selectedId ? "active" : ""} ${
                      record.issues.length ? "has-issue" : ""
                    }`}
                    onClick={() => setSelectedId(record.id)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={record.selected}
                        onChange={() => toggleRecord(record.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Выбрать строку ${record.sourceRow}`}
                      />
                    </td>
                    <td>{record.sourceRow}</td>
                    <td>{record.group || "Без группы"}</td>
                    <td className="article">{record.article}</td>
                    <td>{record.sku}</td>
                    <td>{record.stock}</td>
                    <td>{record.shipQty}</td>
                    <td>{record.balanceAfter}</td>
                    <td>
                      {record.issues.length ? (
                        <span className="pill danger">{record.issues[0]}</span>
                      ) : (
                        <span className="pill ok">Готово</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel detail-panel">
          <div className="panel-title">
            <ClipboardList size={20} />
            <div>
              <h2>Черновик</h2>
              <p>{selectedRecord?.article ?? "Выберите строку"}</p>
            </div>
          </div>

          {selectedDraft ? (
            <>
              <div className="draft-card">
                <dl>
                  <div>
                    <dt>offer_id</dt>
                    <dd>{selectedDraft.offer_id}</dd>
                  </div>
                  <div>
                    <dt>name</dt>
                    <dd>{selectedDraft.name}</dd>
                  </div>
                  <div>
                    <dt>source SKU</dt>
                    <dd>{selectedDraft.source_sku}</dd>
                  </div>
                  <div>
                    <dt>Отгрузка</dt>
                    <dd>{selectedDraft.shipment.total_qty} шт.</dd>
                  </div>
                </dl>
                {selectedDraft.warnings.length > 0 && (
                  <div className="warning-list">
                    {selectedDraft.warnings.slice(0, 4).map((warning) => (
                      <span key={warning}>
                        <AlertTriangle size={14} /> {warning}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="action-button secondary"
                onClick={() => downloadJson(selectedDraft, `${selectedDraft.offer_id}.json`)}
              >
                <FileJson size={18} />
                Скачать выбранный JSON
              </button>
              <p className="action-hint">Выгружаем один черновик для проверки структуры до массовой очереди.</p>
            </>
          ) : (
            <p className="empty">Нет выбранной строки.</p>
          )}

          <div className="queue-summary">
            <h2>План запросов</h2>
            <div>
              <span>Карточки</span>
              <strong>
                {plannedProductRequests} req · {formatSeconds(productEta)}
              </strong>
            </div>
            <div>
              <span>Черновики поставки</span>
              <strong>
                {supplyRequests} req · {formatSeconds(supplyEta)}
              </strong>
            </div>
          </div>

          <div className="api-notes">
            {API_NOTES.map((note) => (
              <article key={note.label}>
                <strong>{note.label}</strong>
                <p>{note.detail}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="panel live-panel">
        <div className="live-header">
          <div>
            <p className="eyebrow">живой OZON API</p>
            <h2>Создать заявку, которую видно в личном кабинете</h2>
          </div>
          <span className={`pill ${liveOrderId ? "ok" : ""}`}>
            {liveOrderId ? `order_id ${liveOrderId}` : "Заявка ещё не создана"}
          </span>
        </div>

        <div className="bulk-control">
          <div className="bulk-control-head">
            <div>
              <p className="eyebrow">массовая отправка</p>
              <h3>Все кластеры из загруженного файла</h3>
            </div>
            <span className="pill">{bulkClusters.length} готово</span>
          </div>
          <div className="bulk-settings">
            <label>
              <span>Ожидаемый ПВЗ</span>
              <input
                value={preferredWarehouseName}
                onChange={(event) => setPreferredWarehouseName(event.target.value)}
              />
              <small>OZON привязывает пункт отгрузки из настроек кабинета</small>
            </label>
            <div>
              <span>Таймслот</span>
              <strong>первый доступный через 7 дней</strong>
            </div>
            <button
              className="action-button danger-button"
              onClick={() => void startBulkSupplies()}
              disabled={!bulkClusters.length || Boolean(liveBusy) || Boolean(bulkJob && !["completed", "completed_with_errors", "cancelled"].includes(bulkJob.state))}
            >
              <Send size={17} /> Запустить все кластеры
            </button>
          </div>
          {unsupportedDestinations.length > 0 && (
            <p className="action-hint">
              Без ID кластера и пока не попадут в запуск: {unsupportedDestinations.join(", ")}.
            </p>
          )}
          {bulkJob && (
            <div className="bulk-progress">
              <div className="bulk-progress-summary">
                <strong>Статус: {bulkJob.state}</strong>
                <span>{bulkJob.completed} готово · {bulkJob.failed} ошибок · {bulkJob.total} всего</span>
              </div>
              <div className="bulk-results">
                {bulkJob.results.map((result) => (
                  <article className={result.state === "completed" ? "complete" : result.state === "failed" ? "failed" : ""} key={result.code}>
                    <strong>{result.code} · {result.name}</strong>
                    <span>{result.message}</span>
                    {result.order_id && <small>order_id {result.order_id}</small>}
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="live-summary">
          <div>
            <span>Товар</span>
            <strong>{selectedRecord?.article || "Выберите строку"}</strong>
          </div>
          <div>
            <span>SKU</span>
            <strong>{selectedRecord?.sku || "—"}</strong>
          </div>
          <label>
            <span>Направление и количество</span>
            <select
              value={liveDestination}
              onChange={(event) => {
                setLiveDestination(event.target.value);
                setLiveDraftId(null);
                setLiveWarehouses([]);
                setLiveWarehouseId("");
                setLiveTimeslots([]);
                setLiveTimeslotFrom("");
                setLiveSupplyDraftId(null);
                setLiveOrderId(null);
                setCancelOperationId("");
              }}
            >
              {destinationOptions.map((item) => (
                <option value={item.code} key={item.code}>
                  {item.code} · {item.name} · {item.qty} шт.{item.id ? "" : " · нужен ID кластера"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="live-steps">
          <article className={liveDraftId ? "complete" : ""}>
            <span className="step-number">1</span>
            <h3>Технический черновик</h3>
            <p>Передаём один SKU, количество и кластер. В ЛК на этом шаге ещё ничего не видно.</p>
            <button
              className="action-button"
              onClick={() => void createLiveDraft()}
              disabled={!liveDestinationData?.id || Boolean(liveBusy) || Boolean(liveDraftId)}
            >
              <Wand2 size={17} />
              {liveDraftId ? `Создан ${liveDraftId}` : "Создать черновик"}
            </button>
          </article>

          <article className={liveWarehouses.length ? "complete" : ""}>
            <span className="step-number">2</span>
            <h3>Склад OZON</h3>
            <p>Получаем только склады со статусом FULL_AVAILABLE и выбираем место поставки.</p>
            <button
              className="action-button secondary"
              onClick={() => void loadLiveWarehouses()}
              disabled={!liveDraftId || Boolean(liveBusy)}
            >
              <Warehouse size={17} /> Запросить склады
            </button>
            {liveWarehouses.length > 0 && (
              <select value={liveWarehouseId} onChange={(event) => setLiveWarehouseId(event.target.value)}>
                <option value="">Выберите ПВЗ</option>
                {liveWarehouses.map((warehouse) => (
                  <option value={warehouse.id} key={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            )}
          </article>

          <article className={liveTimeslots.length ? "complete" : ""}>
            <span className="step-number">3</span>
            <h3>Дата и время</h3>
            <p>Запрашиваем свободные окна начиная через семь дней.</p>
            <button
              className="action-button secondary"
              onClick={() => void loadLiveTimeslots()}
              disabled={!liveWarehouseId || Boolean(liveBusy)}
            >
              <CalendarClock size={17} /> Запросить таймслоты
            </button>
            {liveTimeslots.length > 0 && (
              <select value={liveTimeslotFrom} onChange={(event) => setLiveTimeslotFrom(event.target.value)}>
                {liveTimeslots.map((timeslot) => (
                  <option value={timeslot.from} key={timeslot.from}>
                    {formatTimeslot(timeslot.from)}–{new Date(timeslot.to).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </option>
                ))}
              </select>
            )}
          </article>

          <article className={liveOrderId ? "complete" : ""}>
            <span className="step-number">4</span>
            <h3>Заявка в ЛК</h3>
            <p>Это живое действие: OZON создаёт заявку с выбранным складом и таймслотом.</p>
            <button
              className="action-button danger-button"
              onClick={() => void createVisibleSupply()}
              disabled={!selectedTimeslot || Boolean(liveBusy) || Boolean(liveSupplyDraftId)}
            >
              <Send size={17} /> Создать видимую заявку
            </button>
            <button
              className="action-button secondary"
              onClick={() => void checkVisibleSupply()}
              disabled={!liveSupplyDraftId || Boolean(liveBusy) || Boolean(liveOrderId)}
            >
              <RefreshCcw size={17} /> Проверить появление
            </button>
          </article>

          <article className="cancel-step">
            <span className="step-number">5</span>
            <h3>Отмена теста</h3>
            <p>Отменяем заявку по order_id, пока её текущий статус это допускает.</p>
            <button
              className="action-button secondary"
              onClick={() => void cancelVisibleSupply()}
              disabled={!liveOrderId || Boolean(liveBusy) || Boolean(cancelOperationId)}
            >
              <XCircle size={17} /> Отменить заявку
            </button>
            <button
              className="action-button secondary"
              onClick={() => void checkCancellation()}
              disabled={!cancelOperationId || Boolean(liveBusy)}
            >
              <RefreshCcw size={17} /> Проверить отмену
            </button>
            <button
              className="action-button cancel-all-button"
              onClick={() => void cancelAllCreatedSupplies()}
              disabled={!createdOrderIds.length || Boolean(liveBusy)}
            >
              <XCircle size={17} /> Отменить все ({createdOrderIds.length})
            </button>
            <small>Только заявки, созданные этой CRM и сохранённые в этом браузере.</small>
          </article>
        </div>

        <div className={`live-result ${liveError ? "error" : ""}`}>
          <strong>{liveBusy ? "Выполняется запрос…" : liveError ? "Ошибка" : "Что происходит"}</strong>
          <p>{liveError || liveMessage}</p>
        </div>

        {createdOrderIds.length > 0 && (
          <div className="order-sync">
            <div className="order-sync-head">
              <div>
                <p className="eyebrow">синхронизация с ЛК</p>
                <h3>Созданные заявки</h3>
              </div>
              <button className="icon-text" onClick={() => void syncOrders()} disabled={Boolean(liveBusy)}>
                <RefreshCcw size={17} /> Обновить сейчас
              </button>
            </div>
            <div className="order-sync-grid">
              {createdOrderIds.map((orderId) => {
                const snapshot = orderSnapshots[orderId];
                return (
                  <article key={orderId}>
                    <strong>{orderId}</strong>
                    <span className={`pill ${snapshot?.state?.includes("CANCEL") ? "danger" : "ok"}`}>
                      {snapshot?.state ?? "ожидает синхронизации"}
                    </span>
                    <small>{snapshot?.drop_off_warehouse?.name ?? preferredWarehouseName}</small>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="panel queue-panel">
        <div className="queue-header">
          <div>
            <p className="eyebrow">server-side queue</p>
            <h2>Очередь без back-to-back запросов</h2>
          </div>
          <div className="queue-actions">
            <button className="icon-text primary" onClick={() => setQueueRunning(true)} disabled={!queue.length}>
              <Play size={17} /> Запустить симуляцию
            </button>
            <button className="icon-text" onClick={() => setQueueRunning(false)} disabled={!queue.length}>
              <Pause size={17} /> Пауза
            </button>
            <button
              className="icon-text"
              onClick={() => downloadJson(queue.map(({ payloadPreview }) => payloadPreview), "ozon-queue-payloads.json")}
              disabled={!queue.length}
            >
              <Download size={17} /> Payloads
            </button>
          </div>
        </div>
        <p className="action-hint under-toolbar">
          Симуляция показывает порядок. В боевом варианте здесь должен быть backend-worker с токенами, дедупликацией и retry после 429.
        </p>

        <div className="queue-grid">
          {queue.length ? (
            queue.map((job) => (
              <article className={`queue-job ${job.status}`} key={job.id}>
                <span className="queue-type">{job.endpoint}</span>
                <h3>{job.title}</h3>
                <div className="job-meta">
                  <span>{job.items} позиций</span>
                  <span>{job.requests} запрос</span>
                  <span>{job.type === "product-import" ? `${job.rate}/сек` : "2/min"}</span>
                </div>
                <span className="pill">{job.status}</span>
              </article>
            ))
          ) : (
            <div className="empty wide">Соберите очередь, чтобы увидеть серверные задания.</div>
          )}
        </div>

        <pre className="server-sketch">{`// backend only
const productLimiter = rateLimit({ maxRequests: 40, perMs: 1000 }); // <= 50/sec
const supplyLimiter = rateLimit({ maxRequests: 2, perMs: 60_000 });

await productLimiter.schedule(() =>
  ozon.post("/v3/product/import", { items: nextHundredProducts })
);

await supplyLimiter.schedule(() =>
  ozon.post("/v1/draft/direct/create", nextSupplyDraft)
);`}</pre>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: object;
          annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
          execute: (input?: unknown) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}
