require('dotenv').config();
const mqtt = require('mqtt');
const mysql = require('mysql2/promise');
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 8082;
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
// Firmware giữ nguyên từ dự án nhà thông minh nên tiền tố topic vẫn là nha/phongkhach
const TOPIC = process.env.TOPIC_PREFIX || 'nha/phongkhach';

// shortcut: ngưỡng nhiệt lấy từ .env, chuyển sang đọc từ smart contract ở Giai đoạn 3
const nguong = {
  min: parseFloat(process.env.NGUONG_MIN ?? 2),
  max: parseFloat(process.env.NGUONG_MAX ?? 8),
};

const wss = new WebSocket.Server({ port: WS_PORT });
wss.on('connection', () => console.log('Dashboard mới kết nối qua WebSocket'));

function broadcast(data) {
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data));
  });
}

function kiemTraNguong(topic, giaTri) {
  if (topic !== `${TOPIC}/nhietdo/state`) return null;
  const gt = parseFloat(giaTri);
  if (Number.isNaN(gt)) return null;
  if (gt > nguong.max) return `Nhiệt độ kho ${gt}°C vượt ngưỡng trên ${nguong.max}°C`;
  if (gt < nguong.min) return `Nhiệt độ kho ${gt}°C thấp hơn ngưỡng dưới ${nguong.min}°C`;
  return null;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3307,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

let canhBaoTruocDo = null;

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

  if (topic !== `${TOPIC}/nhietdo/state`) return;
  const canhBao = kiemTraNguong(topic, giaTri);
  // Chỉ báo khi trạng thái đổi (bắt đầu vượt / trở lại bình thường), không lặp mỗi bản tin
  if (Boolean(canhBao) !== Boolean(canhBaoTruocDo)) {
    broadcast({
      type: 'canh_bao',
      muc: canhBao ? 'canh_bao' : 'goi_y',
      message: canhBao || `Nhiệt độ kho ${giaTri}°C đã trở lại trong ngưỡng`,
    });
  }
  canhBaoTruocDo = canhBao;
});

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/nguong', (req, res) => res.json(nguong));

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

app.listen(PORT, () => console.log(`API server đang chạy tại http://localhost:${PORT}`));
