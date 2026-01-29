import React, { useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { HWPXData } from '../../types';
import { parseHWPXContentLocal as parseHWPXContent } from '../../services/localParserService';
import { getTodayKST } from '../utils/date';

interface UseTemplateLoaderReturn {
    extractedData: HWPXData | null;
    originalExtractedData: HWPXData | null;
    originalZip: JSZip | null;
    isLoading: boolean;
    error: string | null;
    retryLoad: () => void;
    setExtractedData: React.Dispatch<React.SetStateAction<HWPXData | null>>;
}

export const useTemplateLoader = (): UseTemplateLoaderReturn => {
    const [extractedData, setExtractedData] = useState<HWPXData | null>(null);
    const [originalExtractedData, setOriginalExtractedData] = useState<HWPXData | null>(null);
    const [originalZip, setOriginalZip] = useState<JSZip | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const loadTemplate = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            console.log('Fetching template from Vercel Blob...');
            const response = await fetch('https://ilytau96fvks52xp.public.blob.vercel-storage.com/template.hwpx');
            if (!response.ok) {
                throw new Error(`템플릿 파일을 불러오는 데 실패했습니다. (Status: ${response.status})`);
            }
            const blob = await response.blob();
            const zip = await JSZip.loadAsync(blob);
            setOriginalZip(zip);

            const sectionFiles = Object.keys(zip.files).filter(name => name.match(/Contents\/section\d+\.xml/i));
            if (sectionFiles.length === 0) {
                throw new Error("문서 내용을 찾을 수 없습니다. 표준 HWPX 형식이 아닐 수 있습니다.");
            }

            // 첫 번째 섹션 파일을 파싱
            const xmlText = await zip.file(sectionFiles[0])!.async("string");
            const data = await parseHWPXContent(xmlText);

            // 오늘 날짜(KST) 구하기
            const today = getTodayKST();

            // 초기 데이터 정제
            const initialData = { ...data };

            // 1. 용도 필드 초기화 (사용자 선택 유도)
            initialData.purpose = "";

            // 2. 발급일 자동 설정 (오늘 날짜)
            // originalExtractedData에도 오늘 날짜를 넣어둬야 '초기화' 시에도 오늘 날짜가 유지됨
            initialData.issueDate = today;

            // 원본 데이터와 현재 데이터 상태 모두 초기화된 값으로 설정
            setOriginalExtractedData(initialData);
            setExtractedData(initialData);

            console.log(`Template loaded. Default issue date set to: ${today}`);
        } catch (err: any) {
            console.error('Error loading template:', err);
            setError(err.message || '템플릿 로드 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTemplate();
    }, [loadTemplate]);

    return {
        extractedData,
        originalExtractedData,
        originalZip,
        isLoading,
        error,
        retryLoad: loadTemplate,
        setExtractedData,
    };
};
