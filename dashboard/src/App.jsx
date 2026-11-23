import { useEffect, useRef, useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Thermometer, Droplets, Activity, Lightbulb, Power, Wifi, WifiOff, User, Snowflake, Loader2,
  Info, Clock, Zap, ToggleLeft, AlertTriangle, X,
} from 'lucide-react';
import { XacThucPanel, NhatKyPanel } from './Blockchain';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8082';
const RECONNECT_DELAY_MS = 3000;

const TOPIC_TO_KEY = {
  'nha/phongkhach/nhietdo/state': 'nhietdo',
  'nha/phongkhach/doam/state': 'doam',
  'nha/phongkhach/chuyendong/state': 'chuyendong',
  'nha/phongkhach/anhsang/state': 'anhsang',
  'nha/phongkhach/relay/state': 'relay',
};

const SENSOR_META = {
  nhietdo: { label: 'Nhiệt độ', unit: '°C', icon: Thermometer, soft: 'bg-warning-soft', tint: 'text-warning' },
  doam: { label: 'Độ ẩm', unit: '%', icon: Droplets, soft: 'bg-secondary-soft', tint: 'text-secondary' },
  chuyendong: {
    label: 'Người trong kho', icon: Activity, soft: 'bg-primary-soft', tint: 'text-primary',
    boolLabels: ['Không có', 'Phát hiện'],
  },
  anhsang: {
    label: 'Cửa kho', icon: Lightbulb, soft: 'bg-aqua-soft', tint: 'text-[#12839c]',
    // Firmware báo ON khi tối (GPIO34 đảo cực): kho đóng kín thì tối, có ánh sáng nghĩa là cửa mở
    boolLabels: ['Mở', 'Đóng'],
  },
};

const CHART_RANGE_OPTIONS = [
  { label: '20 điểm', value: 20 },
  { label: '50 điểm', value: 50 },
];

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function mergeChartSeries(prev, key, points) {
  const map = new Map(prev.map((p) => [p.time, p]));
  for (const { time, value } of points) {
    const existing = map.get(time) || { time };
    map.set(time, { ...existing, [key]: Number(value) });
  }
  return Array.from(map.values())
    .sort((a, b) => new Date(a.time) - new Date(b.time))
    .slice(-50);
}

export default function App() {
  const [sensors, setSensors] = useState({
    nhietdo: { value: null, time: null },
    doam: { value: null, time: null },
    chuyendong: { value: null, time: null },
    anhsang: { value: null, time: null },
  });
  const [relay, setRelay] = useState({ value: null, pending: false });
  const [wsStatus, setWsStatus] = useState('connecting');
  const [chartData, setChartData] = useState([]);
  const [chartRange, setChartRange] = useState(20);
  const [danhSachCanhBao, setDanhSachCanhBao] = useState([]);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const isUnmountedRef = useRef(false);

  // Bước 1: lấy giá trị gần nhất của cả 5 loại dữ liệu ngay khi tải trang
  useEffect(() => {
    const loaiList = ['nhietdo', 'doam', 'chuyendong', 'anhsang', 'relay'];

    loaiList.forEach(async (loai) => {
      try {
        const res = await fetch(`${API_BASE}/api/lichsu/${loai}`);
        if (!res.ok) return;
        const rows = await res.json();
        if (!rows.length) return;

        if (loai === 'relay') {
          setRelay((prev) => ({ ...prev, value: rows[0].gia_tri }));
          return;
        }

        setSensors((prev) => ({
          ...prev,
          [loai]: { value: rows[0].gia_tri, time: rows[0].thoi_gian },
        }));

        if (loai === 'nhietdo' || loai === 'doam') {
          const chronological = [...rows].reverse().map((r) => ({ time: r.thoi_gian, value: r.gia_tri }));
          setChartData((prev) => mergeChartSeries(prev, loai, chronological));
        }
      } catch (err) {
        console.error(`Lỗi tải dữ liệu ban đầu (${loai}):`, err);
      }
    });
  }, []);

  // WebSocket: nhận dữ liệu real-time, tự kết nối lại nếu bị rớt
  useEffect(() => {
    isUnmountedRef.current = false;

    function connect() {
      if (isUnmountedRef.current) return;
      setWsStatus((prev) => (prev === 'connected' ? prev : 'connecting'));

      const socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsStatus('connected');
      };

      socket.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (payload.type === 'canh_bao') {
          const item = { id: Date.now() + Math.random(), message: payload.message, muc: payload.muc };
          setDanhSachCanhBao((prev) => [item, ...prev].slice(0, 5));
          return;
        }

        const key = TOPIC_TO_KEY[payload.topic];
        if (!key) return;

        if (key === 'relay') {
          setRelay({ value: payload.gia_tri, pending: false });
          return;
        }

        const now = new Date().toISOString();
        setSensors((prev) => ({ ...prev, [key]: { value: payload.gia_tri, time: now } }));

        if (key === 'nhietdo' || key === 'doam') {
          setChartData((prev) => mergeChartSeries(prev, key, [{ time: now, value: payload.gia_tri }]));
        }
      };

      socket.onclose = () => {
        wsRef.current = null;
        if (isUnmountedRef.current) return;
        setWsStatus('disconnected');
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  const handleToggleRelay = useCallback(() => {
    setRelay((prev) => {
      if (prev.pending) return prev;
      const next = prev.value === 'ON' ? 'OFF' : 'ON';
      fetch(`${API_BASE}/api/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trang_thai: next }),
      }).catch((err) => {
        console.error('Lỗi gửi lệnh máy làm lạnh:', err);
        setRelay((p) => ({ ...p, pending: false }));
      });
      return { ...prev, pending: true };
    });
  }, []);

  return (
    <div className="min-h-screen pb-10 text-ink">
      {danhSachCanhBao.length > 0 && (
        <div className="space-y-0.5">
          {danhSachCanhBao.map((cb) => (
            <CanhBaoBanner
              key={cb.id}
              message={cb.message}
              muc={cb.muc}
              onClose={() => setDanhSachCanhBao((prev) => prev.filter((item) => item.id !== cb.id))}
            />
          ))}
        </div>
      )}
      <Navbar wsStatus={wsStatus} />

        <main className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 pt-5 md:px-6 lg:grid-cols-[1fr_320px] lg:items-start">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <SensorCard meta={SENSOR_META.nhietdo} data={sensors.nhietdo} />
              <SensorCard meta={SENSOR_META.doam} data={sensors.doam} />
              <SensorCard meta={SENSOR_META.chuyendong} data={sensors.chuyendong} />
              <SensorCard meta={SENSOR_META.anhsang} data={sensors.anhsang} />
            </div>

            <RelayControl relay={relay} onToggle={handleToggleRelay} />

            <ChartCard data={chartData} range={chartRange} onRangeChange={setChartRange} />

            <XacThucPanel />

            <NhatKyPanel />
          </div>

          <NotesPanel />
        </main>
    </div>
  );
}

function CanhBaoBanner({ message, muc, onClose }) {
  const isCanhBao = muc === 'canh_bao';
  const tone = isCanhBao ? 'bg-danger text-white' : 'bg-warning-soft text-warning';
  const buttonHoverTone = isCanhBao ? 'hover:bg-white/20' : 'hover:bg-warning/20';

  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold md:px-6 ${tone}`}>
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} />
        <span>{isCanhBao ? 'CẢNH BÁO: ' : 'THÔNG BÁO: '}{message}</span>
      </div>
      <button
        onClick={onClose}
        aria-label="Đóng cảnh báo"
        className={`flex h-6 w-6 items-center justify-center rounded-full transition ${buttonHoverTone}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function Navbar({ wsStatus }) {
  return (
    <header className="sticky top-0 z-10 px-4 pt-4 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/60 px-5 py-3 shadow-[0_8px_30px_rgba(13,71,161,0.08)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
            <Snowflake size={19} strokeWidth={2} />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight text-ink">Kho Lạnh</div>
            <div className="text-xs leading-tight text-muted">Giám sát chuỗi lạnh · IoT + Blockchain</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionBadge status={wsStatus} />
          <div className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/70 py-1 pl-1 pr-3 sm:flex">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-primary">
              <User size={14} />
            </div>
            <span className="text-xs font-semibold text-ink">Vận hành kho</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function NotesPanel() {
  const items = [
    {
      icon: Clock,
      tone: 'bg-primary-soft text-primary',
      title: 'Nhiệt độ & Độ ẩm (DHT11)',
      body: 'Đọc mỗi ~60 giây. DHT11 có sai số khoảng ±2°C nên đây là mô hình thu nhỏ, chưa đủ chính xác cho kho vắc xin thật.',
    },
    {
      icon: Zap,
      tone: 'bg-secondary-soft text-secondary',
      title: 'Cửa kho & Người trong kho',
      body: 'Cảm biến ánh sáng báo cửa mở (kho đóng kín thì tối), cảm biến chuyển động báo có người. Cả hai báo ngay khi đổi trạng thái.',
    },
    {
      icon: ToggleLeft,
      tone: 'bg-aqua-soft text-[#12839c]',
      title: 'Máy làm lạnh',
      body: 'Relay do người vận hành bật/tắt từ dashboard. Backend bật chế độ thủ công trên ESP32 để tắt tự động hóa của firmware.',
    },
  ];

  return (
    <aside className="space-y-3 rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_8px_30px_rgba(13,71,161,0.06)] backdrop-blur-xl lg:sticky lg:top-24">
      <div className="flex items-center gap-2">
        <Info size={16} className="text-primary" />
        <div className="text-sm font-bold text-ink">Ghi chú kỹ thuật</div>
      </div>
      <div className="space-y-4">
        {items.map(({ icon: Icon, tone, title, body }) => (
          <div key={title} className="flex gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon size={15} />
            </div>
            <div>
              <div className="text-xs font-bold text-ink">{title}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted">{body}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ConnectionBadge({ status }) {
  const config = {
    connecting: {
      Icon: Loader2, spin: true, dot: 'bg-warning',
      text: 'Đang kết nối...', tone: 'border-warning/30 bg-warning-soft text-warning',
    },
    connected: {
      Icon: Wifi, spin: false, dot: 'bg-secondary',
      text: 'Đã kết nối', tone: 'border-secondary/30 bg-secondary-soft text-secondary',
    },
    disconnected: {
      Icon: WifiOff, spin: false, dot: 'bg-danger',
      text: 'Mất kết nối', tone: 'border-danger/30 bg-danger-soft text-danger',
    },
  }[status];
  const { Icon } = config;

  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${config.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${status !== 'connected' ? 'animate-pulse' : ''}`} />
      <Icon size={13} className={config.spin ? 'animate-spin' : ''} />
      {config.text}
    </div>
  );
}

function SensorCard({ meta, data }) {
  const Icon = meta.icon;
  const displayValue = () => {
    if (data.value === null || data.value === undefined) return '--';
    if (meta.boolLabels) return meta.boolLabels[data.value === 'ON' ? 1 : 0];
    return `${data.value}${meta.unit}`;
  };

  return (
    <div className="rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_8px_30px_rgba(13,71,161,0.06)] backdrop-blur-xl transition hover:shadow-[0_12px_36px_rgba(13,71,161,0.10)]">
      <div className="flex items-center justify-between">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${meta.soft} ${meta.tint}`}>
          <Icon size={20} strokeWidth={2} />
        </div>
        <span className="text-[11px] font-medium text-muted">
          {data.time ? formatTime(data.time) : '--:--:--'}
        </span>
      </div>
      <div className="mt-4 text-xs font-semibold text-muted">{meta.label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{displayValue()}</div>
    </div>
  );
}

function RelayControl({ relay, onToggle }) {
  const isOn = relay.value === 'ON';
  const label = relay.pending
    ? 'Đang gửi lệnh...'
    : relay.value === null
      ? 'Chưa rõ trạng thái'
      : isOn ? 'Đang bật' : 'Đang tắt';

  const iconTone = relay.pending
    ? 'bg-warning-soft text-warning'
    : isOn
      ? 'bg-secondary-soft text-secondary'
      : 'bg-primary-soft text-primary';

  const labelTone = relay.pending ? 'text-warning' : isOn ? 'text-secondary' : 'text-ink';

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_8px_30px_rgba(13,71,161,0.06)] backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${iconTone}`}>
          <Power size={22} strokeWidth={2} />
        </div>
        <div>
          <div className="text-xs font-semibold text-muted">Máy làm lạnh</div>
          <div className={`mt-0.5 text-lg font-bold ${labelTone}`}>{label}</div>
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={relay.pending}
        className={`rounded-xl px-6 py-3 text-sm font-bold transition
          ${relay.pending
            ? 'cursor-wait bg-white/70 text-muted'
            : isOn
              ? 'bg-danger text-white shadow-[0_6px_18px_rgba(229,72,77,0.30)] hover:brightness-105'
              : 'bg-secondary text-white shadow-[0_6px_18px_rgba(0,150,136,0.30)] hover:brightness-105'}`}
      >
        {relay.pending ? 'Đang gửi...' : isOn ? 'Tắt' : 'Bật'}
      </button>
    </div>
  );
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-white/70 bg-white/70 p-1 text-xs font-semibold">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-lg px-3 py-1.5 transition ${
            value === opt.value ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ChartCard({ data, range, onRangeChange }) {
  const sliced = data.slice(-range);

  return (
    <div className="rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_8px_30px_rgba(13,71,161,0.06)] backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-ink">Nhiệt độ &amp; Độ ẩm theo thời gian</div>
          <div className="text-xs text-muted">Dữ liệu realtime từ cảm biến trong kho</div>
        </div>
        <SegmentedControl value={range} onChange={onRangeChange} options={CHART_RANGE_OPTIONS} />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sliced}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ee" />
            <XAxis dataKey="time" tickFormatter={formatTime} stroke="#5c6b7a" fontSize={11} />
            <YAxis stroke="#5c6b7a" fontSize={11} />
            <Tooltip
              labelFormatter={formatTime}
              contentStyle={{
                background: 'rgba(255,255,255,0.95)', border: '1px solid #e3edfa',
                borderRadius: 12, color: '#101828',
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="nhietdo" name="Nhiệt độ (°C)" stroke="#f5b300" strokeWidth={2.5} dot={false} connectNulls />
            <Line type="monotone" dataKey="doam" name="Độ ẩm (%)" stroke="#009688" strokeWidth={2.5} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
