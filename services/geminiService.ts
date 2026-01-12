
import { GoogleGenAI, Type } from "@google/genai";
import { HWPXData } from "../types";

/**
 * HWPX XML의 토큰 수를 줄여 Gemini 처리 속도를 향상시키기 위한 클리닝 함수
 */
const simplifyXml = (xml: string): string => {
  return xml
    // 불필요한 레이아웃/스타일 관련 속성 제거 (데이터 추출에 영향 없는 것들)
    .replace(/\s(id|zOrder|textWrap|textFlow|relTo|align|vAlign|opacity|bright|contrast|grayScale|alpha|blur|isShadow|shadow[^=]*|border[^=]*|fill[^=]*|font[^=]*|char[^=]*|line[^=]*|margin[^=]*|padding[^=]*)="[^"]*"/gi, '')
    // 빈 태그나 반복되는 태그 간소화
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 25000); // 2.5 Flash가 가장 빠르게 처리할 수 있는 범위로 조정
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const parseHWPXContent = async (xmlContent: string, retryCount = 0): Promise<HWPXData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const cleanedXml = simplifyXml(xmlContent);
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract key information from this HWPX XML ("해촉증명서"). 
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
      
      XML: ${cleanedXml}`,
      config: {
        responseMimeType: "application/json",
        // 지연 시간을 최소화하기 위해 생각 예산(thinkingBudget)을 0으로 설정
        thinkingConfig: { thinkingBudget: 0 },
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

    return JSON.parse(response.text || '{}') as HWPXData;
  } catch (e: any) {
    // 503 (Unavailable) 또는 서버 과부하 시 최대 2회 재시도 (Exponential Backoff)
    if (retryCount < 2 && (e.message?.includes("503") || e.status === "UNAVAILABLE" || e.message?.includes("overloaded"))) {
      const delay = Math.pow(2, retryCount) * 1500; // 1.5초, 3초 순차 지연
      console.warn(`API Overloaded. Retrying in ${delay}ms...`);
      await sleep(delay);
      return parseHWPXContent(xmlContent, retryCount + 1);
    }
    
    console.error("Failed to parse Gemini response:", e);
    throw new Error("데이터 추출 중 서버 응답이 지연되었습니다. 잠시 후 다시 시도해주세요.");
  }
};
