import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import crypto from 'crypto';

// Global connection pool for re-use across invocations
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000, // 10초 타임아웃 (로컬 환경 안정성을 위해 다시 증설)
    max: 5,                         // 최대 5개 연결
    // ssl: { rejectUnauthorized: false } // Server does not support SSL on port 5999
});

// Pool Warming: Cold Start 시 연결 미리 생성하여 첫 요청 속도 개선
pool.connect()
    .then(client => {
        console.log('✅ Database connection pool warmed up');
        client.release();
    })
    .catch(err => console.error('⚠️ Pool warming failed (non-critical):', err));

// DNS 실패 및 연결 타임아웃 시 자동 재시도 함수
async function queryWithRetry(query: string, params: any[], maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await pool.query(query, params);
        } catch (error: any) {
            // DNS 조회 실패 또는 연결 타임아웃인 경우에만 재시도
            const isDnsError = error.code === 'EAI_AGAIN';
            const isTimeoutError =
                error.message?.includes('connection timeout') ||
                error.message?.includes('Connection terminated') ||
                error.message?.includes('timeout expired');

            const shouldRetry = (isDnsError || isTimeoutError) && attempt < maxRetries;

            if (shouldRetry) {
                // DNS 에러는 빠르게 재시도(500ms), 일반 타임아웃은 더 긴 간격(2000ms)을 두어 안정화 도모
                const delay = isDnsError ? 500 : 2000;
                console.log(`[Retry ${attempt}/${maxRetries}] ${isDnsError ? 'DNS' : 'Connection'} error, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error; // 다른 에러는 즉시 throw
        }
    }
}

function getSsnHash(ssn: string): string {
    if (!process.env.DB_ENCRYPTION_KEY) {
        throw new Error("DB_ENCRYPTION_KEY missing in environment variables");
    }

    return crypto
        .createHmac('sha256', process.env.DB_ENCRYPTION_KEY)
        .update(ssn)
        .digest('hex');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS Configuration
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { registrant_name, ssn, address } = req.body;

    if (!registrant_name || !ssn) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const ssn_hash = getSsnHash(ssn);

        // Blind Index Search (재시도 로직 적용)
        // payment_date 컬럼 추가 조회 (모든 이력 조회)
        const result = await queryWithRetry(
            `SELECT registrant_name, address, payment_date 
             FROM hwpx_01.user_registry 
             WHERE registrant_name = $1 AND ssn_hash = $2`,
            [registrant_name, ssn_hash]
        );

        if (result.rows.length === 0) {
            return res.status(200).json({
                success: false,
                message: '일치하는 데이터가 없습니다.'
            });
        }

        // 1. 주소 검증 (가장 최신(또는 첫번째) 레코드 기준 or 일치하는 것이 하나라도 있으면 통과 처리)
        // 여기서는 첫번째 레코드를 기준으로 기존 로직 유지하되, 전체 rows 중 하나라도 주소가 맞으면 성공으로 간주하는 것이 더 유연함
        const dbRecord = result.rows[0];
        const isAddressMatch = result.rows.some(row => row.address === address || row.address === '-');
        const representativeAddress = dbRecord.address; // 대표 주소 (표시용)

        // 2. 용역기간 산출 로직
        // Request body에서 검색 범위 가져오기
        const { year, startMonth, endMonth } = req.body.searchRange || {};

        let calculatedServicePeriod = null;

        let paymentDates: string[] = [];

        if (year && startMonth && endMonth) {
            const rawDates = result.rows
                .map(r => r.payment_date)
                .filter(d => d); // null/undefined 제거

            // Core Logic: 지급일의 "전달"이 용역 월임
            const serviceMonths_ms: number[] = [];

            rawDates.forEach(dateStr => {
                // dateStr이 Date 객체일 수도 있고 string일 수도 있음 (pg driver 설정에 따름)
                // 원본 날짜 (지급일) 파싱
                const originalDate = new Date(dateStr);
                if (isNaN(originalDate.getTime())) return;

                // 계산용 날짜 복사 (Mutation 방지)
                const calcDate = new Date(originalDate.getTime());

                // 용역 월 = 지급일 - 1개월
                // 예: 2025-05-15 -> 2025-04-15 -> YYYY-MM 추출
                calcDate.setMonth(calcDate.getMonth() - 1);

                const sYear = calcDate.getFullYear();
                const sMonth = calcDate.getMonth() + 1; // 1-indexed

                // 사용자 검색 범위 필터링
                // 검색 범위: [searchStart, searchEnd]
                // 비교 편의를 위해 YYYYMM 정수형으로 변환
                const checkVal = sYear * 100 + sMonth;
                const startVal = parseInt(year) * 100 + parseInt(startMonth);
                const endVal = parseInt(year) * 100 + parseInt(endMonth);

                if (checkVal >= startVal && checkVal <= endVal) {
                    // 해당 월의 1일 날짜(timestamp) 저장
                    serviceMonths_ms.push(new Date(sYear, sMonth - 1, 1).getTime());

                    // 실제 지급일자 포맷팅하여 저장 (YYYY-MM-DD)
                    const pYear = originalDate.getFullYear();
                    const pMonth = String(originalDate.getMonth() + 1).padStart(2, '0');
                    const pDay = String(originalDate.getDate()).padStart(2, '0');
                    paymentDates.push(`${pYear}-${pMonth}-${pDay}`);
                }
            });

            // 날짜순 정렬 (보기 좋게)
            paymentDates.sort();

            if (serviceMonths_ms.length > 0) {
                const minTime = Math.min(...serviceMonths_ms);
                const maxTime = Math.max(...serviceMonths_ms);

                const minDate = new Date(minTime);
                const maxDate = new Date(maxTime);

                // 종료일은 해당 월의 마지막 날로 설정
                const maxYear = maxDate.getFullYear();
                const maxMonth = maxDate.getMonth(); // 0-indexed
                const lastDayOfMaxMonth = new Date(maxYear, maxMonth + 1, 0).getDate();

                const fmt = (y: number, m: number, d: number) =>
                    `${y}년 ${String(m).padStart(2, '0')}월 ${String(d).padStart(2, '0')}일`;

                calculatedServicePeriod = `${fmt(minDate.getFullYear(), minDate.getMonth() + 1, 1)} ~ ${fmt(maxYear, maxMonth + 1, lastDayOfMaxMonth)}`;
            }
        }

        return res.status(200).json({
            success: true,
            addressMatch: isAddressMatch,
            dbAddress: representativeAddress,
            servicePeriod: calculatedServicePeriod,
            paymentDates: paymentDates, // 추가: 지급일자 리스트 반환
            message: isAddressMatch ? '검증 성공' : '주소 불일치'
        });


    } catch (error) {
        console.error('Verify API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}