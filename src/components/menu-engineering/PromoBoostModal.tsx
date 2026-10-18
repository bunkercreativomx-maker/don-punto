import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Loader2, Download, Share2, Copy, Check, Camera, AlertCircle, ImageIcon } from 'lucide-react';
import { pb } from '../../lib/pocketbase';
import { renderPromo } from '../../lib/promoCanvas';

export interface PromoInput {
  name: string;
  description?: string;
  salePrice: number;
  costPrice: number;
  quantity: number;
  slowDay?: string;
  businessName?: string;
  businessPhone?: string;
  stars: { name: string; price: number; cost: number }[];
}

interface PromoCopy {
  tipo: string; combo_con: string; titulo: string; oferta: string;
  precio_promo: number | null; precio_normal: number; dia: string;
  caption: string; hashtags: string[]; whatsapp: string;
}

function compress(file: File, max = 1024, q = 0.85): Promise<string> {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => bad(new Error('No se pudo leer la foto'));
    img.src = URL.createObjectURL(file);
  });
}

export function PromoBoostModal({ product, onClose }: { product: PromoInput; onClose: () => void }) {
  const [usage, setUsage] = useState<{ remaining: number; limit: number; plan: string } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<PromoCopy | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const auth = { Authorization: pb.authStore.token ? `Bearer ${pb.authStore.token}` : '' };

  useEffect(() => {
    fetch('/api/promo-image', { headers: auth }).then(r => r.ok ? r.json() : null).then(d => d && setUsage(d)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try { setPhoto(await compress(f)); } catch (err: any) { setError(err.message); }
  }

  async function generate() {
    setLoading(true); setError(null); setCopy(null); setArt(null); setBlob(null);
    try {
      const res = await fetch('/api/promo-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ ...product, photo: photo || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo generar la promoción.');
      setUsage(u => ({ remaining: data.remaining, limit: data.limit, plan: u?.plan || '' }));
      const c: PromoCopy = data.copy;
      setCopy(c);
      const canvas = await renderPromo({
        photo: data.image, titulo: c.titulo, oferta: c.oferta,
        precioPromo: c.precio_promo, precioNormal: c.precio_normal, dia: c.dia,
        negocio: product.businessName, telefono: product.businessPhone,
      });
      setArt(canvas.toDataURL('image/jpeg', 0.92));
      canvas.toBlob(b => b && setBlob(b), 'image/jpeg', 0.92);
    } catch (err: any) {
      setError(err?.message || 'No se pudo generar la promoción.');
    } finally {
      setLoading(false);
    }
  }

  const fileName = `promo-${product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
  const fullCaption = copy ? `${copy.caption}${copy.hashtags.length ? `\n\n${copy.hashtags.join(' ')}` : ''}` : '';

  async function share() {
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/jpeg' });
    try {
      if ((navigator as any).canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: fullCaption });
        return;
      }
    } catch { /* cancelado */ }
    download();
  }
  function download() {
    if (!art) return;
    const a = document.createElement('a'); a.href = art; a.download = fileName; a.click();
  }
  async function copyText(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1800); } catch { /* sin permiso */ }
  }

  const noLeft = usage !== null && usage.remaining <= 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-xl no-print" onClick={onClose}>
      <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-[0_0_100px_-20px_rgba(22,137,95,0.3)]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-carbon-950/10 flex justify-between items-start gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-rose-400">Impulsar platillo</div>
            <div className="text-lg font-black text-carbon-950 leading-tight mt-0.5">{product.name}</div>
            <div className="text-xs text-slate-500 mt-1">{product.quantity} ventas este mes · ${product.salePrice}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {!art && (
            <>
              <p className="text-sm text-slate-400 leading-relaxed">
                La IA te arma una <b className="text-carbon-950">promoción lista para publicar</b>: imagen para Facebook/Instagram, texto y mensaje de WhatsApp. El precio nunca baja de tu costo.
              </p>
              <div className="rounded-2xl border border-dashed border-carbon-950/15 p-4 flex items-center gap-4">
                {photo
                  ? <img src={photo} alt="" className="w-20 h-20 rounded-xl object-cover" />
                  : <div className="w-20 h-20 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500"><ImageIcon size={26} /></div>}
                <div className="flex-1">
                  <div className="text-sm font-bold text-carbon-950">Foto de tu platillo (recomendado)</div>
                  <div className="text-xs text-slate-500 mt-0.5">Con foto real, la IA mejora TU platillo. Sin foto, crea una imagen ilustrativa.</div>
                  <button onClick={() => fileRef.current?.click()} className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-indigo-400">
                    <Camera size={14} /> {photo ? 'Cambiar foto' : 'Tomar o subir foto'}
                  </button>
                  {photo && <button onClick={() => setPhoto(null)} className="ml-3 text-xs font-bold text-slate-500">Quitar</button>}
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
                </div>
              </div>
            </>
          )}

          {!product.businessName && !art && (
            <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              Tip: agrega el <b>nombre y teléfono de tu negocio</b> en Ajustes para que salgan en la imagen.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />{error}
            </div>
          )}

          {art && copy && (
            <div className="space-y-4">
              <img src={art} alt={`Promoción de ${product.name}`} className="w-full rounded-2xl border border-carbon-950/10" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={share} className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-black text-sm"><Share2 size={16} /> Compartir</button>
                <button onClick={download} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-carbon-950 py-3 rounded-xl font-black text-sm"><Download size={16} /> Descargar</button>
              </div>
              {copy.caption && (
                <div className="bg-slate-950/40 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Texto para Facebook / Instagram</span>
                    <button onClick={() => copyText('fb', fullCaption)} className="text-xs font-black text-indigo-400 inline-flex items-center gap-1">{copied === 'fb' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}</button>
                  </div>
                  <p className="text-sm text-carbon-950 whitespace-pre-line">{fullCaption}</p>
                </div>
              )}
              {copy.whatsapp && (
                <div className="bg-slate-950/40 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estado de WhatsApp</span>
                    <button onClick={() => copyText('wa', copy.whatsapp)} className="text-xs font-black text-indigo-400 inline-flex items-center gap-1">{copied === 'wa' ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}</button>
                  </div>
                  <p className="text-sm text-carbon-950">{copy.whatsapp}</p>
                </div>
              )}
              <p className="text-xs text-slate-500">
                {copy.dia ? <>Lánzala el <b className="text-carbon-950">{copy.dia}</b> (tu día más flojo). </> : null}
                Recuerda dar de alta el precio de promoción en tu menú si lo vas a cobrar en caja.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className={`text-xs font-bold ${noLeft ? 'text-rose-400' : 'text-slate-500'}`}>
              {usage ? `${usage.remaining} de ${usage.limit} promociones este mes` : ' '}
            </span>
            <button
              onClick={generate}
              disabled={loading || noLeft}
              className="flex items-center gap-2 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-black text-sm shadow-lg shadow-rose-500/20 active:scale-95"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? 'Creando promoción…' : noLeft ? 'Límite del mes' : art ? 'Generar otra' : 'Generar promoción'}
            </button>
          </div>
          {noLeft && usage?.plan === 'basico' && (
            <p className="text-xs text-slate-500">Con el plan <b className="text-carbon-950">Pro</b> tienes 20 promociones al mes. Cámbiate desde "Mi plan".</p>
          )}
        </div>
      </div>
    </div>
  );
}
