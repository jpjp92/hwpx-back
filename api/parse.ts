
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
    // Load @google/generative-ai (Official SDK)
    let GoogleGenerativeAIClass: any = null;
    let SchemaType: any = null;
    try {
        const genaiMod = await import('@google/generative-ai');

        // Official SDK ESM export mapping
        GoogleGenerativeAIClass = genaiMod.GoogleGenerativeAI;
        SchemaType = genaiMod.SchemaType;

        if (!GoogleGenerativeAIClass) {
            // Fallback for nested default structures in some bundlers
            GoogleGenerativeAIClass = genaiMod.default?.GoogleGenerativeAI || genaiMod.default;
            SchemaType = genaiMod.default?.SchemaType || genaiMod.SchemaType;
        }

        if (typeof GoogleGenerativeAIClass !== 'function') {
            console.error('Failed to find GoogleGenerativeAI class in @google/generative-ai. Keys:', Object.keys(genaiMod));
            return res.status(500).json({ error: 'AI SDK initialization failed: GoogleGenerativeAI class not found' });
        }
    } catch (impErr: any) {
        console.error('Failed to import @google/generative-ai:', impErr);
        return res.status(500).json({ error: 'Failed to load official AI SDK. Please ensure @google/generative-ai is installed.', details: impErr?.message });
    }

    const genAI = new GoogleGenerativeAIClass(apiKey);

    // Safety check for method existence
    if (typeof genAI.getGenerativeModel !== 'function') {
        console.error('genAI instance missing getGenerativeModel. SDK mismatch?');
        return res.status(500).json({ error: 'AI Client initialization failed: Method missing in official SDK instance' });
    }

    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType?.OBJECT || 'OBJECT',
                properties: {
                    applicant: { type: SchemaType?.STRING || 'STRING' },
                    ssn: { type: SchemaType?.STRING || 'STRING' },
                    address: { type: SchemaType?.STRING || 'STRING' },
                    servicePeriod: { type: SchemaType?.STRING || 'STRING' },
                    serviceContent: { type: SchemaType?.STRING || 'STRING' },
                    purpose: { type: SchemaType?.STRING || 'STRING' },
                    companyName: { type: SchemaType?.STRING || 'STRING' },
                    businessNo: { type: SchemaType?.STRING || 'STRING' },
                    companyAddress: { type: SchemaType?.STRING || 'STRING' },
                    representative: { type: SchemaType?.STRING || 'STRING' },
                    issueDate: { type: SchemaType?.STRING || 'STRING' },
                },
                required: ["applicant", "ssn", "address", "servicePeriod", "serviceContent", "purpose", "companyName", "businessNo", "companyAddress", "representative", "issueDate"]
            }
        }
    });

    try {
        const prompt = `Extract key information from this HWPX XML ("해촉증명서"). 
    Return JSON only. Extract exactly as written.
    
    Fields:
    Fields:
    1. applicant: 신청인
    2. ssn: 주민등록번호
    3. address: 주소지 (신청인 주소)
    4. servicePeriod: 용역기간
    5. serviceContent: 용역내용
    6. purpose: 용도
    7. companyName: 업체명
    8. businessNo: 사업자등록번호
    9. companyAddress: 주소 (업체 주소)
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
            return res.status(500).json({ error: 'Invalid JSON from model', details: parseErr?.message });
        }
    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return res.status(500).json({ error: "Failed to parse document", details: error.message });
    }
}
