
import { GoogleGenAI, Type } from "@google/genai";
import { HWPXData } from "../types";

export const parseHWPXContent = async (xmlContent: string): Promise<HWPXData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Extract the following information from this HWPX XML document. It is a "해촉증명서" (Resignation Certificate).
    Extract exactly as written in the document.
    
    Fields:
    1. applicant: 신청인 성명
    2. ssn: 주민등록번호
    3. address: 주소지
    4. servicePeriod: 용역기간
    5. serviceContent: 용역내용
    6. purpose: 용도
    7. companyName: 업체명 (e.g., (주) 더바이럴)
    8. businessNo: 사업자등록번호
    9. companyAddress: 업체 주소
    10. representative: 대표자 성명
    11. issueDate: 증명서 발급일 (e.g., 2025년 12월 30일)
    
    XML CONTENT:
    ${xmlContent.substring(0, 40000)}`,
    config: {
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
    return JSON.parse(response.text || '{}') as HWPXData;
  } catch (e) {
    console.error("Failed to parse Gemini response:", e);
    throw new Error("데이터 추출에 실패했습니다. 문서 형식을 확인해주세요.");
  }
};
