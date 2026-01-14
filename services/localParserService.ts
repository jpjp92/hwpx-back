import { HWPXData } from "../types";

// Force a short delay to simulate "processing" visual feedback, but much faster than API
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const parseHWPXContentLocal = async (xmlContent: string): Promise<HWPXData> => {
    // Simulate a very short processing time (e.g., 300ms) for better UX
    await sleep(300);

    try {
        // 1. Basic cleaning: Remove XML tags but try to preserve some structure if needed
        // However, fast-xml-parser or just simple regex is better. 
        // Given the structure from section0.xml, text is inside <hp:t>...</hp:t>
        // We can extract all text content first.

        // Strategy: Simple Regex matching on the raw XML string might be robust enough given the specific patterns.
        // Pattern: "신 청 인 : " -> The spaces might be variable or tabs.
        // We will look for the KEYWORDS and capture everything after the colon until a newline or closing tag.

        // remove tabs and huge whitespace to normalize
        const cleanText = xmlContent.replace(/<hp:tab[^>]*\/>/g, " ") // tab -> space
            .replace(/<[^>]+>/g, "") // strip all tags
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " "); // collapse multiple spaces to one

        // Now cleanText is a long string of text. 
        // "해 촉 증 명 서 ... 신 청 인 :  주민등록번호 : ... "



        // Helper to extract by regex
        const extract = (pattern: RegExp): string => {
            const match = cleanText.match(pattern);
            return match ? match[1].trim() : "";
        };

        // Regex patterns based on observation
        // "신 청 인 : "  -> allows spaces between chars
        const data: HWPXData = {
            applicant: extract(/신\s*청\s*인\s*[:;]\s*([^주]+)/), // capture until next keyword "주민등록번호" starts
            ssn: extract(/주\s*민\s*등\s*록\s*번\s*호\s*[:;]\s*([^주]+)/), // until "주소"
            address: extract(/주\s*소\s*지\s*[:;]\s*([^용]+)/), // until "용역기간"
            servicePeriod: extract(/용\s*역\s*기\s*간\s*[:;]\s*([^용]+)/), // until "용역내용"
            serviceContent: extract(/용\s*역\s*내\s*용\s*[:;]\s*([^용]+)/), // until "용도"
            purpose: extract(/용\s*도\s*[:;]\s*([^위]+)/), // until "위의 사실을..." or next section

            // Company Info (at the bottom)
            companyName: extract(/업\s*체\s*명\s*[:;]\s*([^사]+)/), // until "사업자..."
            businessNo: extract(/사\s*업\s*자\s*등\s*록\s*번\s*호\s*[:;]\s*([^주]+)/), // until "주소" (Company address)

            // Company Address needs to be careful not to conflict with Applicant Address
            // The applicant address is labeled "주 소 지" or "주소지", Company is "주 소"
            companyAddress: extract(/주\s*소\s*[:;]\s*([^대]+)/), // until "대표자"

            representative: extract(/대\s*표\s*자\s*[:;]\s*([^()]+)/), // until "(인)" or end

            // Issue date is usually at the end: "2024년 01월 01일" pattern
            // We'll look for the last occurrence of a date pattern
            issueDate: (() => {
                const dateMatches = cleanText.match(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일/g);
                return dateMatches ? dateMatches[dateMatches.length - 1] : ""; // Return the last date found (usually the issue date)
            })()
        };

        // Clean up trailing/leading special chars if any
        Object.keys(data).forEach(key => {
            const k = key as keyof HWPXData;
            if (data[k]) {
                data[k] = data[k].replace(/[:;]/g, "").trim();
            }
        });

        return data;

    } catch (error) {
        console.error("Local parsing failed:", error);
        throw new Error("로컬 문서 분석 중 오류가 발생했습니다.");
    }
};
