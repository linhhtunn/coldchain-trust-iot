require('dotenv').config();
const mqtt = require('mqtt');
const mysql = require('mysql2/promise');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const { khoiTaoChain, xepHang, LOAI_SU_KIEN } = require('./chain');
const { tinhHash } = require('./hash');

const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 8082;
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
// Firmware giữ nguyên từ dự án nhà thông minh nên tiền tố topic vẫn là nha/phongkhach
const TOPIC = process.env.TOPIC_PREFIX || 'nha/phongkhach';
const BATCH_MS = Number(process.env.BATCH_MS) || 5 * 60 * 1000;

const contract = khoiTaoChain({
  rpcUrl: process.env.RPC_URL,
  khoKey: process.env.KHO_KEY,
  diaChi: process.env.CONTRACT_ADDRESS,
});
if (!contract) console.warn('Chưa cấu hình RPC_URL / KHO_KEY / CONTRACT_ADDRESS: chạy không có blockchain');

// Ngưỡng nhiệt (°C). Có contract thì lấy từ chain (chủ hàng đặt), không thì dùng giá trị .env.
const nguong = {
  min: parseFloat(process.env.NGUONG_MIN ?? 2),
  max: parseFloat(process.env.NGUONG_MAX ?? 8),
};

async function docNguong() {
  if (!contract) return;
  try {
    nguong.min = Number(await contract.nguongMin()) / 10;
    nguong.max = Number(await contract.nguongMax()) / 10;
  } catch (err) {
    console.error('Không đọc được ngưỡng từ chain:', err.message);
  }
}

const wss = new WebSocket.Server({ port: WS_PORT });
wss.on('connection', () => console.log('Dashboard mới kết nối qua WebSocket'));

function broadcast(data) {
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data));
  });
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const SQL_DONG_LO = `SELECT id, topic, gia_tri, UNIX_TIMESTAMP(thoi_gian) AS ts
  FROM cam_bien_data WHERE id BETWEEN ? AND ? ORDER BY id`;

// Ghi sự kiện lên chain ngay lập tức (không chờ gom lô). Lỗi chain không được làm hỏng luồng dữ liệu cảm biến.
function ghiSuKienChain(loai, giaTri10, ts) {
  if (!contract) return;
  xepHang(async () => {
    const tx = await contract.ghiSuKien(LOAI_SU_KIEN.indexOf(loai), giaTri10, ts);
    await tx.wait();
    console.log(`[chain] sự kiện ${loai} (${tx.hash})`);
  }).catch((err) => console.error(`[chain] không ghi được sự kiện ${loai}:`, err.message));
}

async function gomLo() {
  if (!contract) return;
  await xepHang(async () => {
    const soLo = Number(await contract.soLo());
    const denIdCuoi = soLo ? Number((await contract.cacLo(soLo - 1)).denId) : 0;
    // Bỏ qua dòng mới hơn 2 giây để một dòng ghi chậm không lọt ra ngoài lô đã niêm phong
    const [[{ maxId }]] = await pool.query(
      'SELECT MAX(id) AS maxId FROM cam_bien_data WHERE thoi_gian < NOW() - INTERVAL 2 SECOND'
    );
    if (!maxId || maxId <= denIdCuoi) return;

    const tuId = denIdCuoi + 1;
    const [rows] = await pool.query(SQL_DONG_LO, [tuId, maxId]);
    if (!rows.length) return;
    const maHash = tinhHash(rows);
    const tx = await contract.neoLo(tuId, maxId, maHash);
    await tx.wait();
    await pool.query(
      'INSERT INTO lo_du_lieu (id_lo, tu_id, den_id, ma_hash, tx_hash) VALUES (?, ?, ?, ?, ?)',
      [soLo, tuId, maxId, maHash, tx.hash]
    );
    console.log(`[chain] đã neo lô ${soLo}: id ${tuId}-${maxId}, ${rows.length} dòng (${tx.hash})`);
  });
}

// Trạng thái lần trước, để chỉ ghi sự kiện khi có thay đổi
let vuotNguongTruoc = false;
let relayTruoc;
let anhSangTruoc;

const client = mqtt.connect(MQTT_URL);

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe(`${TOPIC}/#`);
  // Tắt tự động hóa kiểu nhà thông minh của firmware: relay là máy làm lạnh, do người vận hành điều khiển
  client.publish(`${TOPIC}/thucong/set`, 'ON');
});

client.on('message', async (topic, message) => {
  const giaTri = message.toString();
  try {
    await pool.query('INSERT INTO cam_bien_data (topic, gia_tri) VALUES (?, ?)', [topic, giaTri]);
  } catch (err) {
    console.error('Không ghi được vào MySQL:', err.message);
    return;
  }
  broadcast({ topic, gia_tri: giaTri });

  const ts = Math.floor(Date.now() / 1000);

  if (topic === `${TOPIC}/nhietdo/state`) {
    const nhietDo = parseFloat(giaTri);
    if (Number.isNaN(nhietDo)) return;
    const vuot = nhietDo > nguong.max || nhietDo < nguong.min;
    // Chỉ báo khi trạng thái đổi (bắt đầu vượt / trở lại bình thường), không lặp mỗi bản tin
    if (vuot !== vuotNguongTruoc) {
      const giaTri10 = Math.round(nhietDo * 10);
      ghiSuKienChain(vuot ? 'VuotNguong' : 'TroLaiBinhThuong', giaTri10, ts);
      broadcast({
        type: 'canh_bao',
        muc: vuot ? 'canh_bao' : 'goi_y',
        message: vuot
          ? `Nhiệt độ kho ${nhietDo}°C ngoài ngưỡng cho phép (${nguong.min}–${nguong.max}°C)`
          : `Nhiệt độ kho ${nhietDo}°C đã trở lại trong ngưỡng`,
      });
    }
    vuotNguongTruoc = vuot;
  } else if (topic === `${TOPIC}/relay/state`) {
    if (relayTruoc !== undefined && giaTri !== relayTruoc) {
      ghiSuKienChain(giaTri === 'ON' ? 'MayLanhBat' : 'MayLanhTat', 0, ts);
    }
    relayTruoc = giaTri;
  } else if (topic === `${TOPIC}/anhsang/state`) {
    // Firmware báo ON khi tối (GPIO34 đảo cực): kho đóng kín thì tối, chuyển sang OFF nghĩa là có ánh sáng lọt vào = cửa mở
    if (anhSangTruoc === 'ON' && giaTri === 'OFF') ghiSuKienChain('CuaMo', 0, ts);
    anhSangTruoc = giaTri;
  }
});

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/nguong', (req, res) => res.json(nguong));

// Dashboard dùng thông tin này để tự đọc chain, không cần tin kết quả server trả về
app.get('/api/cau-hinh', (req, res) => {
  res.json({
    diaChi: process.env.CONTRACT_ADDRESS || null,
    rpcUrl: process.env.PUBLIC_RPC_URL || process.env.RPC_URL || null,
    explorerTx: process.env.EXPLORER_TX_URL || null,
  });
});

app.get('/api/lichsu/:loai', async (req, res) => {
  const loai = ['nhietdo', 'doam', 'chuyendong', 'anhsang', 'relay'];
  if (!loai.includes(req.params.loai)) {
    return res.status(404).json({ error: 'Không tìm thấy loại dữ liệu này' });
  }
  const [rows] = await pool.query(
    'SELECT gia_tri, thoi_gian FROM cam_bien_data WHERE topic = ? ORDER BY id DESC LIMIT 50',
    [`${TOPIC}/${req.params.loai}/state`]
  );
  res.json(rows);
});

app.post('/api/relay', (req, res) => {
  const { trang_thai } = req.body;
  if (!['ON', 'OFF'].includes(trang_thai)) {
    return res.status(400).json({ error: 'trang_thai phải là ON hoặc OFF' });
  }
  client.publish(`${TOPIC}/relay/set`, trang_thai);
  res.json({ message: `Đã gửi lệnh ${trang_thai} tới máy làm lạnh` });
});

// Đọc một lô từ chain; trả null nếu chưa cấu hình chain hoặc idLo không tồn tại
async function layLo(idLo) {
  if (!contract || !Number.isInteger(idLo) || idLo < 0) return null;
  if (idLo >= Number(await contract.soLo())) return null;
  const lo = await contract.cacLo(idLo);
  return {
    idLo,
    tuId: Number(lo.tuId),
    denId: Number(lo.denId),
    maHash: lo.maHash,
    thoiGianNeo: Number(lo.thoiGian),
  };
}

app.get('/api/lo-du-lieu', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM lo_du_lieu ORDER BY id_lo DESC LIMIT 50');
  res.json(rows);
});

app.get('/api/lo-du-lieu/:idLo/du-lieu', async (req, res) => {
  if (!contract) return res.status(503).json({ error: 'Chưa cấu hình blockchain' });
  const lo = await layLo(Number(req.params.idLo));
  if (!lo) return res.status(404).json({ error: 'Không có lô này' });
  const [rows] = await pool.query(SQL_DONG_LO, [lo.tuId, lo.denId]);
  res.json({ ...lo, rows });
});

app.get('/api/xac-thuc/:idLo', async (req, res) => {
  if (!contract) return res.status(503).json({ error: 'Chưa cấu hình blockchain' });
  const lo = await layLo(Number(req.params.idLo));
  if (!lo) return res.status(404).json({ error: 'Không có lô này' });
  const [rows] = await pool.query(SQL_DONG_LO, [lo.tuId, lo.denId]);
  const hashTinhLai = tinhHash(rows);
  res.json({ ...lo, soDong: rows.length, hashTinhLai, hopLe: hashTinhLai === lo.maHash });
});

app.get('/api/su-kien', async (req, res) => {
  if (!contract) return res.status(503).json({ error: 'Chưa cấu hình blockchain' });
  const tong = Number(await contract.soSuKien());
  const ids = Array.from({ length: Math.min(tong, 50) }, (_, i) => tong - 1 - i);
  const ketQua = await Promise.all(
    ids.map(async (id) => {
      const s = await contract.cacSuKien(id);
      return {
        id,
        loai: LOAI_SU_KIEN[Number(s.loai)],
        nhietDo: Number(s.giaTri) / 10,
        thoiGianDo: Number(s.thoiGianDo),
        thoiGianGhi: Number(s.thoiGianGhi),
        daXacNhan: s.daXacNhan,
        thanhTra: s.thanhTra,
        ghiChu: s.ghiChu,
      };
    })
  );
  res.json(ketQua);
});

app.listen(PORT, () => console.log(`API server đang chạy tại http://localhost:${PORT}`));

docNguong();
setInterval(docNguong, 30 * 1000);
setInterval(() => gomLo().catch((err) => console.error('[chain] không neo được lô:', err.message)), BATCH_MS);
