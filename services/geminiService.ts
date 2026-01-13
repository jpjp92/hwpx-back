import { HWPXData } from "../types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


export const parseHWPXContent = async (xmlContent: string, retryCount = 0): Promise<HWPXData> => {
  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ xmlContent }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || '네트워크 응답이 올바르지 않습니다.');
    }

    return await response.json() as HWPXData;
  } catch (e: any) {
    if (retryCount < 2) {
      const delay = Math.pow(2, retryCount) * 1500;
      console.warn(`Retry ${retryCount + 1} in ${delay}ms...`);
      await sleep(delay);
      return parseHWPXContent(xmlContent, retryCount + 1);
    }

    console.error("Failed to parse document via backend:", e);
    throw new Error("데이터 추출 중 문제가 발생했습니다. 백엔드 설정을 확인해주세요.");
  }
};
