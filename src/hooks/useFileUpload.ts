import React, { useState } from 'react';
import JSZip from 'jszip';
import { HWPXData, ProcessingState, FileInfo } from '../../types';
import { parseHWPXContentLocal as parseHWPXContent } from '../../services/localParserService';

interface UseFileUploadReturn {
    fileInfo: FileInfo | null;
    extractedData: HWPXData | null;
    originalExtractedData: HWPXData | null;
    originalZip: JSZip | null;
    status: ProcessingState;
    handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    handleCancelUpload: () => void;
    setExtractedData: React.Dispatch<React.SetStateAction<HWPXData | null>>;
    setOriginalExtractedData: React.Dispatch<React.SetStateAction<HWPXData | null>>;
}

export const useFileUpload = (
    showModal: (config: any) => void
): UseFileUploadReturn => {
    const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
    const [extractedData, setExtractedData] = useState<HWPXData | null>(null);
    const [originalExtractedData, setOriginalExtractedData] = useState<HWPXData | null>(null);
    const [originalZip, setOriginalZip] = useState<JSZip | null>(null);
    const [status, setStatus] = useState<ProcessingState>({
        isUnzipping: false,
        isParsing: false,
        error: null,
    });

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = event.target.files?.[0];
        if (!uploadedFile) return;

        if (uploadedFile.name.endsWith('.hwp')) {
            showModal({
                type: 'error',
                title: '형식 미지원',
                message: "이 프로그램은 .hwpx 형식만 지원합니다.\\n.hwp 파일을 한글 프로그램에서 '다른 이름으로 저장'을 통해\\n'.hwpx'로 변환 후 업로드해주세요."
            });
            setFileInfo(null);
            setExtractedData(null);
            return;
        }

        if (!uploadedFile.name.endsWith('.hwpx')) {
            showModal({
                type: 'error',
                title: '형식 미지원',
                message: "지원하지 않는 파일 형식입니다. .hwpx 파일을 업로드해주세요."
            });
            return;
        }

        setFileInfo({
            name: uploadedFile.name,
            size: uploadedFile.size,
            lastModified: uploadedFile.lastModified,
        });
        setStatus({ isUnzipping: true, isParsing: false, error: null });

        try {
            const zip = await JSZip.loadAsync(uploadedFile);
            setOriginalZip(zip);

            const sectionFiles = Object.keys(zip.files).filter(name => name.match(/Contents\/section\d+\.xml/i));
            if (sectionFiles.length === 0) throw new Error("문서 내용을 찾을 수 없습니다. 표준 HWPX 형식이 아닐 수 있습니다.");

            const xmlText = await zip.file(sectionFiles[0])!.async("string");

            setStatus(prev => ({ ...prev, isUnzipping: false, isParsing: true }));

            const data = await parseHWPXContent(xmlText);
            setExtractedData(data);
            setOriginalExtractedData(data);
            setStatus(prev => ({ ...prev, isParsing: false }));
        } catch (err: any) {
            console.error(err);
            setStatus({ isUnzipping: false, isParsing: false, error: err.message || "파일 처리 중 오류가 발생했습니다." });
        }
    };

    const handleCancelUpload = () => {
        setFileInfo(null);
        setExtractedData(null);
        setOriginalExtractedData(null);
        setOriginalZip(null);
        setStatus({ isUnzipping: false, isParsing: false, error: null });
    };

    return {
        fileInfo,
        extractedData,
        originalExtractedData,
        originalZip,
        status,
        handleFileUpload,
        handleCancelUpload,
        setExtractedData,
        setOriginalExtractedData,
    };
};
