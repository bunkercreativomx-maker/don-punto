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

  const prompt = `Analiza esta imagen de un menú de restaurante.
Extrae todos los platillos y sus precios. 
Responde ÚNICAMENTE con un arreglo de objetos en formato JSON válido.
Estructura exacta:
[
  {
    "name": "Nombre del platillo",
    "salePrice": 150
  }
]
Si un precio tiene símbolo de moneda, quítalo y deja solo el número.
No agregues formato Markdown (\\\`\\\`\\\`json), ni texto antes o después. Solo el JSON puro.`;

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
      console.error('Gemini scan error:', err);
      return res.status(502).json({ error: 'Error en Gemini API', details: err });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Respuesta vacía de Gemini' });

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error('scan-menu handler error:', err);
    return res.status(500).json({ error: 'Error interno', details: err?.message });
  }
}
