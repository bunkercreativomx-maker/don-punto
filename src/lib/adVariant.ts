// Inicio del landing según el anuncio que trajo el clic (message match).
// El anuncio enlaza a donpunto.com/?a=05 (o utm_content=a05) y la página abre con la misma promesa.
// Los textos salen de los 15 anuncios de Meta (hyperframes/dp-ads15-ve/src/copys.py). Sin marcas de terceros.

export interface AdHero { title: string; sub: string; founderOnly?: boolean }

// Tokens: {fundador} precio fundador básico, {normal} precio normal, {lugares} límite, {dia} costo por día
export const AD_HERO: Record<string, AdHero> = {
  a01: { title: 'Empieza sin tarjeta', sub: '¿Te da miedo registrar tu tarjeta y que se te olvide cancelar? Aquí no te la pedimos para empezar. Cobras en segundos desde tu celular y el corte de caja sale solo, con todo y el IVA.' },
  a02: { title: 'Corte de caja que sí cuadra', sub: 'Cada día sin corte de caja es dinero que no sabes a dónde se fue. Con Don Punto sabes cuánto debe haber en el cajón antes de contarlo.' },
  a03: { title: 'Llega a diciembre con tu caja en orden', sub: 'Diciembre es el mes más fuerte para tu restaurante. Le tomas foto a tu menú, la IA lo carga por ti y empiezas a cobrar el mismo día.' },
  a04: { title: 'Precio de fundador: ${fundador} de por vida', sub: 'Solo los primeros {lugares} negocios pagan ${fundador} al mes en lugar de ${normal}, mientras sigan suscritos. Cuando se acaben los lugares, ya no regresa.', founderOnly: true },
  a05: { title: 'Punto de venta para taquerías', sub: 'Hora pico, fila de clientes y tú anotando órdenes en papel. Con Don Punto cobras en segundos, mandas la comanda a cocina y el corte de caja sale solo.' },
  a06: { title: 'Tu corte de caja sale solo', sub: 'Deja de cerrar tu negocio contando billetes a las 11 de la noche. Efectivo, tarjeta y transferencias separados, y sabes al momento si te faltó o te sobró.' },
  a07: { title: 'Tu menú se carga desde una foto', sub: 'Lo que más da flojera no es pagar un sistema, es configurarlo. Le tomas foto a tu menú y la inteligencia artificial lo carga por ti. Si sabes usar tu celular, sabes usar Don Punto.' },
  a08: { title: 'Sabe cuánto ganaste hoy', sub: 'Vender mucho no es lo mismo que ganar. Con Don Punto cobras rápido y al cerrar ves tu corte de caja con el IVA ya separado.' },
  a09: { title: 'Tu celular ya es tu punto de venta', sub: 'No necesitas comprar una caja registradora de miles de pesos. Le tomas foto a tu menú, la IA lo carga y empiezas a cobrar.' },
  a10: { title: 'Tu negocio desde tu celular', sub: '¿Te vas un día y no sabes quién cobró ni cuánto entró? Con Don Punto lo ves desde tu celular, estés donde estés. Cada noche te llega el cierre del día.' },
  a11: { title: 'Para cafeterías, panaderías y food trucks', sub: 'No solo los restaurantes necesitan llevar el control. Don Punto funciona en el celular o la tablet que ya tienes y tu menú se carga desde una foto.' },
  a12: { title: 'Cierra caja en 2 minutos', sub: 'Efectivo, tarjeta, transferencias y apps, todo separado y con el IVA listo. Sin contar billetes dos veces.' },
  a13: { title: 'Menos de ${dia} al día', sub: '¿Crees que un punto de venta es caro? Como fundador te sale en menos de ${dia} al día: cobras en segundos, el corte de caja sale solo y ves tus reportes desde el celular.', founderOnly: true },
  a14: { title: 'Tu tienda en línea, 0% comisión', sub: 'De cada $100 que vendes en apps de comida, a veces te quedan $56. Con Don Punto tienes tu propia tienda en línea, con tu menú y tu nombre, y cero comisión por pedido. Incluida en todos los planes.' },
  a15: { title: 'Cobra tu primera venta hoy, gratis', sub: 'Sin tarjeta, sin contratos y sin comprar equipo. Le tomas foto a tu menú, la IA lo carga y en minutos ya estás cobrando desde tu celular.' },
  a16: { title: 'Reloj checador para tus empleados, ya incluido', sub: 'Desde el 1 de enero de 2027 la ley pide llevar un registro electrónico de la entrada y la salida de cada trabajador. Con Don Punto tus empleados checan con su PIN en el mismo equipo donde cobras, y tú ves las horas de cada quien por semana.' },
};

const KEY = 'dp_ad';

/** Código del anuncio (a01…a15) de esta visita; se recuerda en la sesión para ligarlo al registro. */
export function getAd(): string | null {
  try {
    const p = new URLSearchParams(window.location.search);
    const raw = (p.get('a') || p.get('utm_content') || '').trim().toLowerCase();
    const m = raw.match(/^a?(\d{1,2})$/);
    if (m) {
      const code = 'a' + m[1].padStart(2, '0');
      if (AD_HERO[code]) { sessionStorage.setItem(KEY, code); return code; }
    }
    const saved = sessionStorage.getItem(KEY);
    return saved && AD_HERO[saved] ? saved : null;
  } catch {
    return null;
  }
}

export function fillAd(text: string, v: { fundador: number; normal: number; lugares: number; dia: number }): string {
  return text.replace(/\{(fundador|normal|lugares|dia)\}/g, (_, k: keyof typeof v) => String(v[k]));
}
