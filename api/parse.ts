
import { GoogleGenAI, Type } from "@google/genai";

export const config = {
    maxDuration: 60, // Vercel function timeout (seconds)
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { xmlContent } = req.body;
    if (!xmlContent) {
        return res.status(400).json({ error: 'XML content is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API Key not configured on server' });
    }

    const genAI = new GoogleGenAI(apiKey);
    // Use the same model as in geminiService.ts
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    applicant: { type: Type.STRING },
                    ssn: { type: Type.STRING },
                    address: { type: Type.STRING },
                    servicePeriod: { type: Type.STRING },
                    serviceContent: { type: Type.STRING },
                    purpose: { type: Type.STRING },
                    companyName: { type: Type.STRING },
                    businessNo: { type: Type.STRING },
                    companyAddress: { type: Type.STRING },
                    representative: { type: Type.STRING },
                    issueDate: { type: Type.STRING },
                },
                required: ["applicant", "ssn", "address", "servicePeriod", "serviceContent", "purpose", "companyName", "businessNo", "companyAddress", "representative", "issueDate"]
            }
        }
    });

    try {
        const prompt = `Extract key information from this HWPX XML ("해촉증명서"). 
    Return JSON only. Extract exactly as written.
    
    Fields:
    1. applicant: 성명
    2. ssn: 주민번호
    3. address: 주소
    4. servicePeriod: 기간
    5. serviceContent: 내용
    6. purpose: 용도
    7. companyName: 업체명
    8. businessNo: 사업자번호
    9. companyAddress: 업체주소
    10. representative: 대표자
    11. issueDate: 발급일 (e.g. 2025년 12월 30일)
    
    XML: ${xmlContent.substring(0, 30000)}`;
        console.log(`parse handler: received XML ${xmlContent.length} bytes`);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        // response.text() returns a Promise<string>
        const text = await response.text();

        try {
            const parsed = JSON.parse(text);
            return res.status(200).json(parsed);
        } catch (parseErr: any) {
            console.error("Failed to JSON.parse model response:", parseErr);
            // Return raw text for debugging (not ideal for production)
            return res.status(500).json({ error: 'Invalid JSON from model', raw: text, details: parseErr?.message });
        }
    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return res.status(500).json({ error: "Failed to parse document", details: error.message });
    }
}
