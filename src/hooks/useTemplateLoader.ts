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

            // 초기 데이터 정제: 용도 필드는 항상 초기화 (사용자 선택 유도) 및 유효성 검사
            const initialData = { ...data };
            const VALID_PURPOSES = ['국민건강보험공단', '국민연금공단'];

            // 템플릿에 저장된 값이 유효하지 않거나, 이미 '제출'이 붙어있는 등의 경우를 대비해
            // 초기 로드 시에는 용도를 비워두는 것이 안전합니다.
            // 만약 템플릿의 값을 살리고 싶다면 아래 조건을 수정해야 합니다.
            // 현재 정책: 초기화/로드 시 용도는 '선택' 상태(빈 값)로 시작.
            initialData.purpose = "";

            // 원본 데이터 상태에도 정제된 데이터를 저장하여 초기화 시 문제가 없도록 함
            setOriginalExtractedData(initialData);

            // 오늘 날짜(KST)로 발급일 자동 설정
            const today = getTodayKST();
            setExtractedData({ ...initialData, issueDate: today });
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
