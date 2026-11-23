import { useCallback, useEffect, useState } from 'react';
import { Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import { ShieldCheck, ShieldX, ScrollText, ExternalLink, Loader2, BadgeCheck, Thermometer } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

const ABI_DOC = [
  'function cacLo(uint256) view returns (uint64 tuId, uint64 denId, bytes32 maHash, uint64 thoiGian)',
];

const NHAN_SU_KIEN = {
  VuotNguong: { text: 'Nhiệt độ vượt ngưỡng', tone: 'bg-danger-soft text-danger' },
  TroLaiBinhThuong: { text: 'Nhiệt độ trở lại bình thường', tone: 'bg-secondary-soft text-secondary' },
  MayLanhBat: { text: 'Máy làm lạnh bật', tone: 'bg-primary-soft text-primary' },
  MayLanhTat: { text: 'Máy làm lạnh tắt', tone: 'bg-warning-soft text-warning' },
  CuaMo: { text: 'Cửa kho mở', tone: 'bg-warning-soft text-warning' },
};

const CARD = 'rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_8px_30px_rgba(13,71,161,0.06)] backdrop-blur-xl';

const fmtGiay = (giay) => new Date(giay * 1000).toLocaleString('vi-VN');
const rutGon = (hash) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

// Phải giống hệt backend/hash.js: id|topic|gia_tri|giây, nối bằng \n, sắp theo id
function tinhHash(rows) {
  const chuoi = [...rows]
    .sort((a, b) => a.id - b.id)
    .map((r) => `${r.id}|${r.topic}|${r.gia_tri}|${r.ts}`)
    .join('\n');
  return keccak256(toUtf8Bytes(chuoi));
}

// Kiểm tra hoàn toàn trong trình duyệt: lấy dữ liệu thô từ server, tự tính hash, tự đọc hash từ chain.
// Server chỉ cung cấp dữ liệu, không được tin vào kết luận của nó.
async function kiemTraLo(idLo, cauHinh) {
  const contract = new Contract(cauHinh.diaChi, ABI_DOC, new JsonRpcProvider(cauHinh.rpcUrl));
  const [lo, res] = await Promise.all([
    contract.cacLo(idLo),
    fetch(`${API_BASE}/api/lo-du-lieu/${idLo}/du-lieu`).then((r) => {
      if (!r.ok) throw new Error('Server không trả dữ liệu của lô');
      return r.json();
    }),
  ]);
  const hashTinhLai = tinhHash(res.rows);
  return { hopLe: hashTinhLai === lo.maHash, hashChain: lo.maHash, hashTinhLai, soDong: res.rows.length };
}

function useCauHinh() {
  const [cauHinh, setCauHinh] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/cau-hinh`).then((r) => r.json()).then(setCauHinh).catch(() => setCauHinh({}));
  }, []);
  return cauHinh;
}

function useLamMoi(url, chuKyMs) {
  const [data, setData] = useState(null);
  const [loi, setLoi] = useState(false);
  const tai = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}${url}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLoi(false);
    } catch {
      setLoi(true);
    }
  }, [url]);
  useEffect(() => {
    tai();
    const t = setInterval(tai, chuKyMs);
    return () => clearInterval(t);
  }, [tai, chuKyMs]);
  return { data, loi, tai };
}

export function XacThucPanel() {
  const cauHinh = useCauHinh();
  const { data: cacLo, loi } = useLamMoi('/api/lo-du-lieu', 20000);
  const [ketQua, setKetQua] = useState({});

  const kiemTra = async (idLo) => {
    setKetQua((p) => ({ ...p, [idLo]: { trangThai: 'dang' } }));
    try {
      const r = await kiemTraLo(idLo, cauHinh);
      setKetQua((p) => ({ ...p, [idLo]: { trangThai: r.hopLe ? 'ok' : 'sua', ...r } }));
    } catch (err) {
      setKetQua((p) => ({ ...p, [idLo]: { trangThai: 'loi', thongBao: err.message } }));
    }
  };

  const chuaCoChain = cauHinh && !cauHinh.diaChi;

  return (
    <div className={CARD}>
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck size={16} className="text-primary" />
        <span className="text-sm font-bold text-ink">Xác thực dữ liệu</span>
      </div>
      <div className="mb-4 text-xs text-muted">
        Mỗi lô dữ liệu cảm biến được niêm phong bằng một mã hash trên blockchain. Nút Kiểm tra tự tính lại hash
        từ dữ liệu trong cơ sở dữ liệu rồi so với hash trên chain.
      </div>

      {chuaCoChain && <div className="text-xs text-warning">Backend chưa cấu hình blockchain.</div>}
      {loi && <div className="text-xs text-danger">Không tải được danh sách lô.</div>}
      {cacLo && cacLo.length === 0 && <div className="text-xs text-muted">Chưa có lô nào được niêm phong.</div>}

      <div className="space-y-2">
        {(cacLo || []).map((lo) => {
          const kq = ketQua[lo.id_lo];
          return (
            <div key={lo.id_lo} className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-ink">
                    Lô #{lo.id_lo} <span className="font-medium text-muted">· dòng {lo.tu_id}–{lo.den_id}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    Niêm phong lúc {new Date(lo.thoi_gian).toLocaleString('vi-VN')} · <span className="font-mono">{rutGon(lo.ma_hash)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cauHinh?.explorerTx && (
                    <a
                      href={`${cauHinh.explorerTx}${lo.tx_hash}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                      Xem trên chain <ExternalLink size={11} />
                    </a>
                  )}
                  <button
                    onClick={() => kiemTra(lo.id_lo)}
                    disabled={!cauHinh?.diaChi || kq?.trangThai === 'dang'}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {kq?.trangThai === 'dang' ? <Loader2 size={13} className="animate-spin" /> : 'Kiểm tra'}
                  </button>
                </div>
              </div>

              {kq?.trangThai === 'ok' && (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-secondary">
                  <ShieldCheck size={14} /> Nguyên vẹn — hash tính lại khớp với hash trên chain ({kq.soDong} dòng)
                </div>
              )}
              {kq?.trangThai === 'sua' && (
                <div className="mt-2 text-xs font-bold text-danger">
                  <div className="flex items-center gap-1.5"><ShieldX size={14} /> Đã bị chỉnh sửa — hash không khớp</div>
                  <div className="mt-1 font-mono text-[10px] font-normal">
                    Trên chain: {rutGon(kq.hashChain)} · Tính lại: {rutGon(kq.hashTinhLai)}
                  </div>
                </div>
              )}
              {kq?.trangThai === 'loi' && <div className="mt-2 text-xs text-danger">Lỗi: {kq.thongBao}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function NhatKyPanel() {
  const { data: suKien, loi } = useLamMoi('/api/su-kien', 10000);
  const { data: nguong } = useLamMoi('/api/nguong', 15000);

  return (
    <div className={CARD}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText size={16} className="text-primary" />
          <span className="text-sm font-bold text-ink">Nhật ký sự kiện trên blockchain</span>
        </div>
        {nguong && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold text-primary">
            <Thermometer size={12} /> Ngưỡng cho phép: {nguong.min}–{nguong.max}°C
          </span>
        )}
      </div>
      <div className="mb-4 text-xs text-muted">
        Sự kiện quan trọng được ghi lên chain ngay khi xảy ra, không chờ gom lô. Ngưỡng nhiệt do chủ hàng đặt.
      </div>

      {loi && <div className="text-xs text-danger">Không tải được nhật ký (backend chưa cấu hình blockchain?).</div>}
      {suKien && suKien.length === 0 && <div className="text-xs text-muted">Chưa có sự kiện nào.</div>}

      <div className="space-y-2">
        {(suKien || []).map((s) => {
          const nhan = NHAN_SU_KIEN[s.loai] || { text: s.loai, tone: 'bg-primary-soft text-primary' };
          return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${nhan.tone}`}>{nhan.text}</span>
                {(s.loai === 'VuotNguong' || s.loai === 'TroLaiBinhThuong') && (
                  <span className="text-xs font-semibold text-ink">{s.nhietDo}°C</span>
                )}
                <span className="text-[11px] text-muted">{fmtGiay(s.thoiGianDo)}</span>
              </div>
              {s.daXacNhan ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-secondary" title={s.thanhTra}>
                  <BadgeCheck size={13} /> Thanh tra đã xác nhận{s.ghiChu ? `: ${s.ghiChu}` : ''}
                </span>
              ) : (
                <span className="text-[11px] text-muted">Chưa xác nhận</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
