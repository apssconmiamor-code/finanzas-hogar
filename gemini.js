// =============================================
// IA (Gemini) — pre-llenado de movimiento desde un recordatorio
// =============================================
// Analiza el texto, la foto y el audio de un recordatorio y sugiere
// categoría/concepto/monto para el formulario de "Nuevo movimiento". Solo
// SUGIERE — nunca guarda nada por su cuenta; el usuario revisa y decide.

const Gemini = {
  // "gemini-2.0-flash" devolvía 429 (cuota en 0 para esta key/proyecto) y
  // el key con prefijo "AQ." que usamos no es válido como parámetro
  // ?key=... (Google lo rechaza con 401) — hay que mandarlo en el header
  // X-goog-api-key. Verificado a mano contra la API real antes de dejarlo así.
  MODEL: "gemini-flash-lite-latest",

  url() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent`;
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
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": CONFIG.GEMINI_API_KEY
      },
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
    if (data?.promptFeedback?.blockReason) {
      throw new Error(`Gemini bloqueó la solicitud: ${data.promptFeedback.blockReason}`);
    }
    const candidato = data?.candidates?.[0];
    if (candidato?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidato.finishReason)) {
      throw new Error(`Gemini no terminó la respuesta (${candidato.finishReason})`);
    }
    // Filtra partes de "pensamiento" (thought:true) — solo interesa la
    // respuesta final, que es la que debería venir en JSON.
    const textoRespuesta = candidato?.content?.parts
      ?.filter(p => !p.thought)
      .map(p => p.text || "")
      .join("");
    if (!textoRespuesta) throw new Error("Gemini no devolvió una respuesta utilizable");

    // Por si acaso viene envuelta en ```json ... ``` a pesar de haber
    // pedido responseMimeType "application/json".
    const limpio = textoRespuesta.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    try {
      return JSON.parse(limpio);
    } catch (e) {
      throw new Error("La respuesta de la IA no vino en el formato esperado: " + limpio.slice(0, 150));
    }
  }
};
