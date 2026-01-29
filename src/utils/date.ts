/**
 * KST(한국 표준시) 기준으로 현재 날짜를 "YYYY년 MM월 DD일" 형식으로 반환합니다.
 */
export const getTodayKST = (): string => {
    // 서버 환경과 관계없이 KST(UTC+9) 시간을 계산합니다.
    const curr = new Date();
    const utc = curr.getTime() + (curr.getTimezoneOffset() * 60 * 1000);
    const KR_TIME_DIFF = 9 * 60 * 60 * 1000;
    const krCurr = new Date(utc + KR_TIME_DIFF);

    const year = krCurr.getFullYear();
    const month = String(krCurr.getMonth() + 1).padStart(2, '0');
    const day = String(krCurr.getDate()).padStart(2, '0');

    return `${year}년 ${month}월 ${day}일`;
};
