export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en el servidor.' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Body inválido' }); }
  }

  const { imageBase64, mimeType } = body || {};
  if (!imageBase64) return res.status(400).json({ error: 'Se requiere imageBase64' });

  const prompt = `Eres un asistente para restaurantes en México. Analiza esta imagen de una factura, ticket o nota de compra.

Extrae TODOS los productos/insumos comprados con sus cantidades, unidades y precios unitarios exactos como aparecen en el documento.

Reglas:
- El nombre del insumo debe ser limpio, capitalizado y en español (ej: "Tomate", "Lechuga romana", "Pollo entero")
- La unidad debe ser la que aparece en la factura (kg, pz, piezas, litros, l, g, ml, caja, paquete, bolsa, etc.)
- La cantidad debe ser numérica (ej: 5, 2.5, 12)
- El precio unitario es el costo POR UNIDAD (no el total de la línea). Si solo hay total, divide por cantidad.
- Si no aparece precio, usa 0
- Si no es una factura de alimentos/insumos, devuelve items vacío

Responde ÚNICAMENTE con JSON válido sin texto adicional:
{
  "items": [
    {
      "nombre": "string",
      "cantidad": number,
      "unidad": "string",
      "precioUnitario": number
    }
  ]
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
            ],
          }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini factura error:', err);
      return res.status(502).json({ error: 'Error en Gemini API', details: err });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Respuesta vacía de Gemini' });

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error('factura handler error:', err);
    return res.status(500).json({ error: 'Error interno', details: err?.message });
  }
}
