
import { GoogleGenAI, Type } from "@google/genai";

export const analyzeInvoice = async (imageBase64: string) => {
  // Inicializamos dentro de la función para mayor seguridad
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64,
              },
            },
            {
              text: "Eres un experto contable. Extrae la información de esta factura. Necesito el número de factura, el monto total (solo número, sin símbolos) y la moneda (ARS o USD). Devuelve solo un objeto JSON válido.",
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            invoiceNumber: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            currency: { type: Type.STRING, enum: ["ARS", "USD"] },
          },
          required: ["invoiceNumber", "amount", "currency"],
        },
      },
    });

    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (e) {
    console.error("Error analizando con Gemini:", e);
    return null;
  }
};
