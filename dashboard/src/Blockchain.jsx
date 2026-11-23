import { useEffect, useState } from 'react';
import { BrowserProvider, Contract, JsonRpcProvider, keccak256, toUtf8Bytes } from 'ethers';
import {
  ShieldCheck, ShieldX, ScrollText, ExternalLink, Loader2, BadgeCheck, Thermometer, Wallet,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

const ABI = [
  'function cacLo(uint256) view returns (uint64 tuId, uint64 denId, bytes32 maHash, uint64 thoiGian)',
  'function nguongMin() view returns (int32)',
  'function nguongMax() view returns (int32)',
  'function vaiTro(address) view returns (uint8)',
  'function datNguong(int32 min, int32 max)',
  'function xacNhanSuKien(uint256 idSuKien, string ghiChu)',
];

const TEN_VAI_TRO = ['Chưa có vai trò', 'Kho', 'Chủ hàng', 'Thanh tra'];
const VT_CHU_HANG = 2;
const VT_THANH_TRA = 3;

const NHAN_SU_KIEN = {
  VuotNguong: { text: 'Nhiệt độ vượt ngưỡng', tone: 'bg-danger-soft text-danger' },
  TroLaiBinhThuong: { text: 'Nhiệt độ trở lại bình thường', tone: 'bg-secondary-soft text-secondary' },
  MayLanhBat: { text: 'Máy làm lạnh bật', tone: 'bg-primary-soft text-primary' },
  MayLanhTat: { text: 'Máy làm lạnh tắt', tone: 'bg-warning-soft text-warning' },
  CuaMo: { text: 'Cửa kho mở', tone: 'bg-warning-soft text-warning' },
};

const CARD = 'rounded-3xl border border-white/70 bg-white/60 p-5 shadow-[0_8px_30px_rgba(13,71,161,0.06)] backdrop-blur-xl';
const INPUT = 'w-20 rounded-lg border border-white/70 bg-white/80 px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-primary';
const NUT = 'rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50';

const fmtGiay = (giay) => new Date(giay * 1000).toLocaleString('vi-VN');
const rutGon = (hash) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;
const thongBaoLoi = (err) => err?.reason || err?.shortMessage || err?.message || 'Lỗi không xác định';

// Phải giống hệt backend/hash.js: id|topic|gia_tri|giây, nối bằng \n, sắp theo id
function tinhHash(rows) {
  const chuoi = [...rows]
    .sort((a, b) => a.id - b.id)
    .map((r) => `${r.id}|${r.topic}|${r.gia_tri}|${r.ts}`)
    .join('\n');
  return keccak256(toUtf8Bytes(chuoi));
}

const docChain = (cauHinh) => new Contract(cauHinh.diaChi, ABI, new JsonRpcProvider(cauHinh.rpcUrl));

// Kiểm tra hoàn toàn trong trình duyệt: lấy dữ liệu thô từ server, tự tính hash, tự đọc hash từ chain.
// Server chỉ cung cấp dữ liệu, không được tin vào kết luận của nó.
async function kiemTraLo(idLo, cauHinh) {
  const [lo, res] = await Promise.all([
    docChain(cauHinh).cacLo(idLo),
    fetch(`${API_BASE}/api/lo-du-lieu/${idLo}/du-lieu`).then((r) => {
      if (!r.ok) throw new Error('Server không trả dữ liệu của lô');
      return r.json();
    }),
  ]);
  const hashTinhLai = tinhHash(res.rows);
  return { hopLe: hashTinhLai === lo.maHash, hashChain: lo.maHash, hashTinhLai, soDong: res.rows.length };
}

// Kết nối MetaMask và chuyển sang đúng mạng của contract (tự thêm mạng nếu chưa có)
async function ketNoiVi(cauHinh) {
  if (!window.ethereum) throw new Error('Chưa cài MetaMask trên trình duyệt này');
  const [taiKhoan] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const chainId = `0x${Number(cauHinh.chainId).toString(16)}`;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (err) {
    if (err.code !== 4902) throw err;
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId, chainName: cauHinh.tenMang, rpcUrls: [cauHinh.rpcUrl],
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      }],
    });
  }
  return taiKhoan;
}

// Gửi giao dịch ký bằng ví MetaMask, đợi được xác nhận
async function guiBangVi(cauHinh, ham, ...thamSo) {
  const signer = await new BrowserProvider(window.ethereum).getSigner();
  const tx = await new Contract(cauHinh.diaChi, ABI, signer)[ham](...thamSo);
  await tx.wait();
}

function useCauHinh() {
  const [cauHinh, setCauHinh] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/cau-hinh`).then((r) => r.json()).then(setCauHinh).catch(() => setCauHinh({}));
  }, []);
  return cauHinh;
}

function useLamMoi(url, chuKyMs, phienBan = 0) {
  const [data, setData] = useState(null);
  const [loi, setLoi] = useState(false);
  useEffect(() => {
    let huy = false;
    const tai = async () => {
      try {
        const res = await fetch(`${API_BASE}${url}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!huy) { setData(json); setLoi(false); }
      } catch {
        if (!huy) setLoi(true);
      }
    };
    tai();
    const t = setInterval(tai, chuKyMs);
    return () => { huy = true; clearInterval(t); };
  }, [url, chuKyMs, phienBan]);
  return { data, loi };
}

// Ngưỡng đọc thẳng từ chain (không qua server) để luôn đúng ngay sau khi chủ hàng đổi
function useNguongChain(cauHinh, phienBan) {
  const [nguong, setNguong] = useState(null);
  useEffect(() => {
    if (!cauHinh?.diaChi) return undefined;
    let huy = false;
    const c = docChain(cauHinh);
    const doc = async () => {
      try {
        const [min, max] = await Promise.all([c.nguongMin(), c.nguongMax()]);
        if (!huy) setNguong({ min: Number(min) / 10, max: Number(max) / 10 });
      } catch { /* chain tạm thời không đọc được: giữ giá trị cũ */ }
    };
    doc();
    const t = setInterval(doc, 15000);
    return () => { huy = true; clearInterval(t); };
  }, [cauHinh, phienBan]);
  return nguong;
}

export default function BlockchainPanels() {
  const cauHinh = useCauHinh();
  const [vi, setVi] = useState({ taiKhoan: null, vaiTro: 0 });
  const [phienBan, setPhienBan] = useState(0); // tăng lên để các khung tải lại sau khi có giao dịch
  const nguong = useNguongChain(cauHinh, phienBan);

  // Đổi tài khoản trong MetaMask thì cập nhật lại vai trò
  useEffect(() => {
    if (!cauHinh?.diaChi || !window.ethereum?.on) return undefined;
    const khiDoi = async (ds) => {
      const taiKhoan = ds[0] || null;
      const vaiTro = taiKhoan ? Number(await docChain(cauHinh).vaiTro(taiKhoan)) : 0;
      setVi({ taiKhoan, vaiTro });
    };
    window.ethereum.on('accountsChanged', khiDoi);
    return () => window.ethereum.removeListener?.('accountsChanged', khiDoi);
  }, [cauHinh]);

  return (
    <>
      <ViPanel cauHinh={cauHinh} vi={vi} setVi={setVi} nguong={nguong} onDoi={() => setPhienBan((n) => n + 1)} />
      <XacThucPanel cauHinh={cauHinh} />
      <NhatKyPanel cauHinh={cauHinh} vi={vi} nguong={nguong} phienBan={phienBan} onDoi={() => setPhienBan((n) => n + 1)} />
    </>
  );
}

function ViPanel({ cauHinh, vi, setVi, nguong, onDoi }) {
  const [loi, setLoi] = useState(null);
  const [dangGui, setDangGui] = useState(false);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const ketNoi = async () => {
    setLoi(null);
    try {
      const taiKhoan = await ketNoiVi(cauHinh);
      setVi({ taiKhoan, vaiTro: Number(await docChain(cauHinh).vaiTro(taiKhoan)) });
    } catch (err) {
      setLoi(thongBaoLoi(err));
    }
  };

  const datNguong = async () => {
    const [a, b] = [Number(min), Number(max)];
    if (min === '' || max === '' || Number.isNaN(a) || Number.isNaN(b) || a >= b) {
      setLoi('Ngưỡng không hợp lệ: nhiệt độ thấp nhất phải nhỏ hơn cao nhất');
      return;
    }
    setLoi(null);
    setDangGui(true);
    try {
      await guiBangVi(cauHinh, 'datNguong', Math.round(a * 10), Math.round(b * 10));
      setMin('');
      setMax('');
      onDoi();
    } catch (err) {
      setLoi(thongBaoLoi(err));
    } finally {
      setDangGui(false);
    }
  };

  return (
    <div className={CARD}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-primary" />
          <span className="text-sm font-bold text-ink">Ví và vai trò</span>
        </div>
        {nguong && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold text-primary">
            <Thermometer size={12} /> Ngưỡng cho phép: {nguong.min}–{nguong.max}°C
          </span>
        )}
      </div>
      <div className="mb-3 text-xs text-muted">
        Chủ hàng và thanh tra ký bằng ví MetaMask của riêng mình. Smart contract nhìn vào chữ ký để biết ai đang
        thao tác, nên kho không thể giả danh hai vai trò này.
      </div>

      {!vi.taiKhoan ? (
        <button onClick={ketNoi} disabled={!cauHinh?.diaChi} className={NUT}>Kết nối MetaMask</button>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-ink">
            <span className="font-mono">{rutGon(vi.taiKhoan)}</span> ·{' '}
            <span className="font-bold">{TEN_VAI_TRO[vi.vaiTro]}</span>
          </div>

          {vi.vaiTro === VT_CHU_HANG && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
              Đặt ngưỡng nhiệt:
              <input className={INPUT} value={min} onChange={(e) => setMin(e.target.value)} placeholder="Thấp (°C)" inputMode="decimal" />
              –
              <input className={INPUT} value={max} onChange={(e) => setMax(e.target.value)} placeholder="Cao (°C)" inputMode="decimal" />
              <button onClick={datNguong} disabled={dangGui} className={NUT}>
                {dangGui ? <Loader2 size={13} className="animate-spin" /> : 'Lưu lên chain'}
              </button>
            </div>
          )}
          {vi.vaiTro === VT_THANH_TRA && (
            <div className="text-xs text-muted">Bạn có thể xác nhận các sự kiện trong nhật ký bên dưới.</div>
          )}
          {vi.vaiTro === 0 && (
            <div className="text-xs text-warning">Ví này chưa được cấp vai trò nên chỉ xem được dữ liệu.</div>
          )}
        </div>
      )}
      {loi && <div className="mt-2 text-xs text-danger">{loi}</div>}
    </div>
  );
}

function XacThucPanel({ cauHinh }) {
  const { data: cacLo, loi } = useLamMoi('/api/lo-du-lieu', 20000);
  const [ketQua, setKetQua] = useState({});

  const kiemTra = async (idLo) => {
    setKetQua((p) => ({ ...p, [idLo]: { trangThai: 'dang' } }));
    try {
      const r = await kiemTraLo(idLo, cauHinh);
      setKetQua((p) => ({ ...p, [idLo]: { trangThai: r.hopLe ? 'ok' : 'sua', ...r } }));
    } catch (err) {
      setKetQua((p) => ({ ...p, [idLo]: { trangThai: 'loi', thongBao: thongBaoLoi(err) } }));
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
                  <button onClick={() => kiemTra(lo.id_lo)} disabled={!cauHinh?.diaChi || kq?.trangThai === 'dang'} className={NUT}>
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

function NhatKyPanel({ cauHinh, vi, nguong, phienBan, onDoi }) {
  const { data: suKien, loi } = useLamMoi('/api/su-kien', 10000, phienBan);
  const [dangGhi, setDangGhi] = useState(null); // id sự kiện đang nhập ghi chú
  const [ghiChu, setGhiChu] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loiGui, setLoiGui] = useState(null);

  const xacNhan = async (id) => {
    setLoiGui(null);
    setDangGui(true);
    try {
      await guiBangVi(cauHinh, 'xacNhanSuKien', id, ghiChu.trim());
      setDangGhi(null);
      setGhiChu('');
      onDoi();
    } catch (err) {
      setLoiGui(thongBaoLoi(err));
    } finally {
      setDangGui(false);
    }
  };

  return (
    <div className={CARD}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText size={16} className="text-primary" />
          <span className="text-sm font-bold text-ink">Nhật ký sự kiện trên blockchain</span>
        </div>
        {nguong && (
          <span className="text-[11px] font-semibold text-muted">Ngưỡng hiện tại: {nguong.min}–{nguong.max}°C</span>
        )}
      </div>
      <div className="mb-4 text-xs text-muted">
        Sự kiện quan trọng được ghi lên chain ngay khi xảy ra, không chờ gom lô. Thanh tra xác nhận bằng ví của mình.
      </div>

      {loi && <div className="text-xs text-danger">Không tải được nhật ký (backend chưa cấu hình blockchain?).</div>}
      {loiGui && <div className="mb-2 text-xs text-danger">{loiGui}</div>}
      {suKien && suKien.length === 0 && <div className="text-xs text-muted">Chưa có sự kiện nào.</div>}

      <div className="space-y-2">
        {(suKien || []).map((s) => {
          const nhan = NHAN_SU_KIEN[s.loai] || { text: s.loai, tone: 'bg-primary-soft text-primary' };
          return (
            <div key={s.id} className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                ) : vi.vaiTro === VT_THANH_TRA && dangGhi !== s.id ? (
                  <button onClick={() => { setDangGhi(s.id); setGhiChu(''); }} className={NUT}>Xác nhận</button>
                ) : (
                  <span className="text-[11px] text-muted">Chưa xác nhận</span>
                )}
              </div>

              {dangGhi === s.id && !s.daXacNhan && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className={`${INPUT} w-64`} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)}
                    placeholder="Ghi chú của thanh tra" maxLength={200}
                  />
                  <button onClick={() => xacNhan(s.id)} disabled={dangGui} className={NUT}>
                    {dangGui ? <Loader2 size={13} className="animate-spin" /> : 'Ký và gửi'}
                  </button>
                  <button onClick={() => setDangGhi(null)} className="text-xs font-semibold text-muted hover:text-ink">Hủy</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
