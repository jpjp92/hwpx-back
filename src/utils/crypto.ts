/**
 * 주민번호 1차 암호화 (SHA-256)
 * 클라이언트에서 수행하여 네트워크 전송 시 원본 노출을 차단합니다.
 */
export const hashSSN = async (ssn: string): Promise<string> => {
    if (!ssn) return "";
    const msgUint8 = new TextEncoder().encode(ssn);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
