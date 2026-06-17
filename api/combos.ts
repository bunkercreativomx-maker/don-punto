export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Body inválido' }); }
  }

  const { products } = body || {};
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de products.' });
  }

  const productList = products
    .map((p: any, i: number) => `${i + 1}. ${p.name} — ${p.quantity} ventas — Precio unitario: $${Number(p.price).toFixed(2)}`)
    .join('\n');

  const prompt = `Eres un experto en estrategia de menú para restaurantes en México.
Con base en los siguientes productos más vendidos del mes, genera exactamente 5 propuestas de combos atractivos para aumentar el ticket promedio y las ventas.

TOP PRODUCTOS DEL MES:
${productList}

Reglas para los combos:
- Cada combo debe incluir 2 o 3 productos del listado.
- El precio del combo debe ser menor a la suma individual (descuento real).
- El nombre debe ser creativo y fácil de recordar.
- La razón debe ser concisa (máximo 2 oraciones).

Responde ÚNICAMENTE con un JSON válido con esta estructura exacta, sin texto adicional:
{
  "combos": [
    {
      "nombre": "string",
      "productos": ["string", "string"],
      "precio": 0,
      "razon": "string"
    }
  ]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error:', errText);
      return res.status(502).json({ error: 'Error en Gemini API', details: errText });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Respuesta vacía de Gemini' });

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error('combos handler error:', err);
    return res.status(500).json({ error: 'Error interno', details: err?.message });
  }
}
