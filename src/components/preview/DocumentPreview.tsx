import React, { useRef, useState, useEffect } from 'react';
import { BookOpen, Info } from 'lucide-react';
import Card from '../ui/Card';
import SectionHeader from '../ui/SectionHeader';
import { HWPXData } from '../../../types';

interface DocumentPreviewProps {
    data: HWPXData;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({ data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const updateScale = () => {
            if (!containerRef.current || !previewRef.current) return;

            const containerWidth = containerRef.current.offsetWidth - 48; // padding (24px * 2)
            const contentWidth = 210 * 3.7795275591; // 210mm to px (approx 793px)

            const newScale = Math.min(1, containerWidth / contentWidth);
            setScale(newScale);
        };

        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    return (
        <Card className="p-5 h-full flex flex-col">
            <SectionHeader
                title={
                    <div className="flex items-center gap-2">
                        <BookOpen size={16} className="text-blue-600" />
                        <span>문서 미리보기</span>
                    </div>
                }
                right={
                    <div className="group relative">
                        <Info size={14} className="text-slate-300 cursor-help" />
                        <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-[11px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30 shadow-lg">
                            입력한 내용이 반영된 A4 미리보기 화면입니다. 실제 다운로드 파일과 동일합니다.
                        </div>
                    </div>
                }
            />

            <div
                ref={containerRef}
                className="mt-4 flex-1 flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 min-h-[600px] overflow-y-auto overflow-x-hidden relative scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
            >
                <div
                    className="origin-top transition-transform duration-300 shadow-xl ring-1 ring-slate-900/5 mb-1"
                    style={{
                        transform: `scale(${scale})`,
                        height: `calc((297mm * ${scale}) + 40px)`
                    }}
                >
                    <div
                        ref={previewRef}
                        className="w-[210mm] bg-white min-h-[297mm] p-[30mm] flex flex-col text-black leading-tight serif-doc relative overflow-hidden select-none"
                    >
                        {/* Paper Texture */}
                        <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')]"></div>

                        {/* Content */}
                        <div className="relative flex-1 flex flex-col h-full z-10">
                            <div className="text-center mt-[20mm] mb-[45mm]">
                                <h1 className="text-[28pt] font-bold inline-block border-b-[1px] border-black pb-2 px-4">해 &nbsp; 촉 &nbsp; 증 &nbsp; 명 &nbsp; 서</h1>
                            </div>

                            <div className="space-y-[12mm] text-[15pt] pl-[5mm] pr-[5mm]">
                                <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                                    <div className="whitespace-nowrap flex justify-between h-full"><span>신</span><span>청</span><span>인</span></div>
                                    <div className="text-center">:</div>
                                    <div className="font-semibold">{data.applicant}</div>
                                </div>
                                <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                                    <div className="whitespace-nowrap">주 민 등 록 번 호</div>
                                    <div className="text-center">:</div>
                                    <div className="font-semibold">{data.ssn}</div>
                                </div>
                                <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                                    <div className="whitespace-nowrap flex justify-between"><span>주</span><span>소</span><span>지</span></div>
                                    <div className="text-center">:</div>
                                    <div className="font-semibold break-words word-break-keep-all">{data.address}</div>
                                </div>
                                <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                                    <div className="whitespace-nowrap flex justify-between"><span>용</span><span>역</span><span>기</span><span>간</span></div>
                                    <div className="text-center">:</div>
                                    <div className="font-semibold">{data.servicePeriod}</div>
                                </div>
                                <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                                    <div className="whitespace-nowrap flex justify-between"><span>용</span><span>역</span><span>내</span><span>용</span></div>
                                    <div className="text-center">:</div>
                                    <div className="font-semibold">{data.serviceContent}</div>
                                </div>
                                <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                                    <div className="whitespace-nowrap flex justify-between"><span>용</span><span>도</span></div>
                                    <div className="text-center">:</div>
                                    <div className="font-semibold">{data.purpose ? `${data.purpose} 제출` : ''}</div>
                                </div>
                            </div>

                            <div className="mt-[50mm] mb-[30mm] flex flex-col items-end pr-[15mm] w-full">
                                <div className="text-[15pt] font-medium mb-[40mm]">
                                    위의 사실을 증명합니다.
                                </div>
                                <div className="text-[16pt] font-bold tracking-[0.1em]">
                                    {data.issueDate}
                                </div>
                            </div>
                        </div>

                        {/* Corner Marks */}
                        <div className="absolute top-[10mm] left-[10mm] w-[15mm] h-[15mm] border-t-2 border-l-2 border-slate-100"></div>
                        <div className="absolute top-[10mm] right-[10mm] w-[15mm] h-[15mm] border-t-2 border-r-2 border-slate-100"></div>
                        <div className="absolute bottom-[10mm] left-[10mm] w-[15mm] h-[15mm] border-b-2 border-l-2 border-slate-100"></div>
                        <div className="absolute bottom-[10mm] right-[10mm] w-[15mm] h-[15mm] border-b-2 border-r-2 border-slate-100"></div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default DocumentPreview;
