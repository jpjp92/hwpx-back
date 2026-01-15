import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import crypto from 'crypto';

// Global connection pool for re-use across invocations
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // ssl: { rejectUnauthorized: false } // Server does not support SSL on port 5999
});

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

        // Blind Index Search
        // Matches against hash only, never decrypts the SSN
        const result = await pool.query(
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
