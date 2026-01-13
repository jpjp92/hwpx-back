
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
    // Load @google/genai dynamically with robust member extraction
    let GoogleGenAIClass: any = null;
    let GenAIType: any = null;
    try {
        const mod = await import('@google/genai');

        // Comprehensive check for the GoogleGenAI class
        GoogleGenAIClass = mod.GoogleGenAI || mod.default?.GoogleGenAI || (typeof mod.default === 'function' ? mod.default : null);
        GenAIType = mod.Type || mod.default?.Type;

        if (!GoogleGenAIClass || typeof GoogleGenAIClass !== 'function') {
            console.error('Failed to find GoogleGenAI constructor. Module keys:', Object.keys(mod));
            if (mod.default) console.error('Default export keys:', Object.keys(mod.default));
            return res.status(500).json({ error: 'Server misconfiguration: GoogleGenAI class not found' });
        }
    } catch (impErr: any) {
        console.error('Failed to import @google/genai in server:', impErr);
        return res.status(500).json({ error: 'Failed to initialize AI client', details: impErr?.message });
    }

    const genAI = new GoogleGenAIClass(apiKey);

    // Safety check for method existence
    if (typeof genAI.getGenerativeModel !== 'function') {
        console.error('genAI instance does not have getGenerativeModel method. Proto:', Object.getPrototypeOf(genAI));
        return res.status(500).json({ error: 'AI Client initialization failed: Method missing' });
    }

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: GenAIType?.OBJECT || 'OBJECT',
                properties: {
                    applicant: { type: GenAIType?.STRING || 'STRING' },
                    ssn: { type: GenAIType?.STRING || 'STRING' },
                    address: { type: GenAIType?.STRING || 'STRING' },
                    servicePeriod: { type: GenAIType?.STRING || 'STRING' },
                    serviceContent: { type: GenAIType?.STRING || 'STRING' },
                    purpose: { type: GenAIType?.STRING || 'STRING' },
                    companyName: { type: GenAIType?.STRING || 'STRING' },
                    businessNo: { type: GenAIType?.STRING || 'STRING' },
                    companyAddress: { type: GenAIType?.STRING || 'STRING' },
                    representative: { type: GenAIType?.STRING || 'STRING' },
                    issueDate: { type: GenAIType?.STRING || 'STRING' },
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
