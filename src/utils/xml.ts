/**
 * XML 객체를 재귀적으로 탐색하여 텍스트 값을 정밀하게 치환하는 함수
 * HWPX 파일의 XML 구조를 유지하면서 특정 텍스트만 교체합니다.
 */
export const replaceTextInObject = (obj: any, originalVal: string, currentVal: string): any => {
    // null 또는 undefined는 그대로 반환하여 구조를 유지함
    if (obj === null || obj === undefined) return obj;

    const objType = typeof obj;

    if (objType === 'string') {
        // 문자열인 경우에만 치환 수행
        return obj.split(originalVal).join(currentVal);
    }

    if (Array.isArray(obj)) {
        // 배열인 경우 모든 요소를 순회하며 치환
        for (let i = 0; i < obj.length; i++) {
            const result = replaceTextInObject(obj[i], originalVal, currentVal);
            // 결과가 undefined가 아닌 경우에만 할당 (방어적 처리)
            if (result !== undefined) {
                obj[i] = result;
            }
        }
    } else if (objType === 'object') {
        // 객체인 경우 모든 속성을 순회하며 치환
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                // HWPX의 구조를 결정하는 속성(Attribute, @_로 시작)은 치환에서 제외하여 서식 깨짐 방지
                if (key.startsWith('@_')) continue;

                const result = replaceTextInObject(obj[key], originalVal, currentVal);
                if (result !== undefined) {
                    obj[key] = result;
                }
            }
        }
    }
    return obj;
};
