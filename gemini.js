// =============================================
// IA (Gemini) — pre-llenado de movimiento desde un recordatorio
// =============================================
// Analiza el texto, la foto y el audio de un recordatorio y sugiere
// categoría/concepto/monto para el formulario de "Nuevo movimiento". Solo
// SUGIERE — nunca guarda nada por su cuenta; el usuario revisa y decide.

const Gemini = {
  MODEL: "gemini-2.0-flash",

  url() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  },

  async analizarRecordatorio({ texto, fotos, audio }) {
    const hoy = new Date().toISOString().split("T")[0];
    const conceptosFijos     = GASTOS_FIJOS.join(", ");
    const conceptosVariables = GASTOS_VARIABLES.join(", ");
    const fuentesIngreso     = FUENTES_INGRESO.join(", ");

    const prompt = `Eres un asistente que ayuda a registrar movimientos financieros de un hogar a partir de una nota rápida (puede traer texto, una foto y/o un audio).

Analiza TODO lo que se te dio (texto, foto — puede ser un recibo o captura — y el audio) y devuelve SOLO un JSON con este formato exacto, sin texto adicional ni explicaciones:

{"categoria":"Gasto fijo"|"Gasto variable"|"Ingreso","concepto":"string","monto":number,"descripcion":"string","confianza":"alta"|"media"|"baja"}

Reglas:
- "categoria": si es dinero que entra, "Ingreso"; si es un gasto fijo mensual (arriendo, servicios, suscripciones), "Gasto fijo"; cualquier otro gasto, "Gasto variable".
- "concepto": si es Gasto fijo, usa EXACTAMENTE uno de estos: ${conceptosFijos}. Si es Gasto variable, usa EXACTAMENTE uno de estos si aplica: ${conceptosVariables} (si ninguno aplica, usa "Otros"). Si es Ingreso, usa uno de: ${fuentesIngreso} si aplica, o describe la fuente en pocas palabras.
- "monto": solo el número en pesos colombianos (sin símbolos ni separadores de miles). Si no puedes determinarlo con certeza, usa 0.
- "descripcion": un resumen corto (máx. 80 caracteres).
- "confianza": qué tan seguro estás del concepto y el monto juntos.
- Ante poca información, prefiere monto 0 y concepto "Otros" antes que inventar datos.
- Fecha de referencia (hoy): ${hoy}.`;

    const parts = [{ text: prompt }];
    if (texto) parts.push({ text: `Nota escrita por el usuario: "${texto}"` });
    (fotos || []).forEach(f => {
      if (f) parts.push({ inline_data: { mime_type: f.mimeType, data: f.data } });
    });
    if (audio) parts.push({ inline_data: { mime_type: audio.mimeType, data: audio.data } });

    const res = await fetch(this.url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      })
    });

    if (!res.ok) {
      const cuerpo = await res.text().catch(() => "");
      throw new Error(`Gemini respondió ${res.status}: ${cuerpo.slice(0, 200)}`);
    }

    const data = await res.json();
    const textoRespuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoRespuesta) throw new Error("Gemini no devolvió una respuesta utilizable");

    try {
      return JSON.parse(textoRespuesta);
    } catch (e) {
      throw new Error("La respuesta de la IA no vino en el formato esperado");
    }
  }
};
