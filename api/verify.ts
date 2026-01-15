import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import crypto from 'crypto';

// Global connection pool for re-use across invocations
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000, // 10초 타임아웃
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
            const shouldRetry = (
                error.code === 'EAI_AGAIN' ||
                error.message?.includes('connection timeout') ||
                error.message?.includes('Connection terminated')
            ) && attempt < maxRetries;

            if (shouldRetry) {
                console.log(`[Retry ${attempt}/${maxRetries}] Connection error: ${error.message}, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5초 대기
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
        // Matches against hash only, never decrypts the SSN
        const result = await queryWithRetry(
            `SELECT registrant_name, address 
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

        const dbRecord = result.rows[0];

        // Address Verification (Smart Check)
        // Passes if addresses match exactly OR if DB address is '-'
        const isAddressMatch = dbRecord.address === address || dbRecord.address === '-';

        return res.status(200).json({
            success: true,
            addressMatch: isAddressMatch,
            dbAddress: dbRecord.address,
            message: isAddressMatch ? '검증 성공' : '주소 불일치'
        });

    } catch (error) {
        console.error('Verify API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}