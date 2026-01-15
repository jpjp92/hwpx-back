/**
 * 문자의 시각적 너비를 계산합니다.
 * 한글/한자는 2, 영문/숫자는 1.1의 가중치를 가집니다.
 */
export const getCharWeight = (c: string): number => {
    const code = c.charCodeAt(0);
    return (code >= 0xac00 && code <= 0xd7af) || (code >= 0x1100 && code <= 0x11ff) ? 2 : 1.1;
};

/**
 * 주소 텍스트의 총 가중치를 계산합니다.
 */
export const calculateTextWeight = (text: string): number => {
    return Array.from(text).reduce((sum, char) => sum + getCharWeight(char), 0);
};

/**
 * HWPX 레이아웃 상수
 */
export const LAYOUT_CONSTANTS = {
    WEIGHT_PER_LINE: 100,
    LABEL_WEIGHT: 20, // "주   소   지  :  " 라벨의 시각적 너비
} as const;
