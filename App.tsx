import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { Upload, FileText, Edit3, Loader2, Save, RotateCcw, Calendar, Zap, FileType, BookOpen, Search, Check, Info, CheckCircle2, X, AlertCircle, RefreshCw } from 'lucide-react';
import { HWPXData } from './types';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import Card from './src/components/ui/Card';
import SectionHeader from './src/components/ui/SectionHeader';
import Button from './src/components/ui/Button';
import Modal, { ModalConfig } from './src/components/ui/Modal';
import { hashSSN } from './src/utils/crypto';
import { replaceTextInObject } from './src/utils/xml';
import { getCharWeight, LAYOUT_CONSTANTS } from './src/utils/hwpx/layout';
import { getTodayKST } from './src/utils/date';
import { useTemplateLoader } from './src/hooks/useTemplateLoader';

const App: React.FC = () => {
  // 모달 상태 관리
  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showModal = (config: Partial<ModalConfig>) => {
    setModalConfig({
      isOpen: true,
      type: config.type || 'info',
      title: config.title || '',
      message: config.message || '',
      onConfirm: config.onConfirm,
      onCancel: config.onCancel,
      confirmLabel: config.confirmLabel || '확인',
      cancelLabel: config.cancelLabel,
    });
  };

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  // 템플릿 로더 훅 사용
  const {
    extractedData,
    originalExtractedData,
    originalZip,
    isLoading,
    error: loadError,
    retryLoad,
    setExtractedData,
  } = useTemplateLoader();

  const [isVerified, setIsVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);


  // 브라우저 크기에 맞춰 A4 미리보기 크기를 자동으로 조절하는 로직
  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        // 컨테이너 너비에서 적절한 여백을 뺀 값 기준
        const containerWidth = containerRef.current.clientWidth - 48;
        const a4Width = 794; // 약 210mm를 픽셀로 환산 (96dpi 기준)
        const newScale = Math.min(containerWidth / a4Width, 1);
        setScale(newScale);
      }
    };
    window.addEventListener('resize', updateScale);
    // 초기 실행 및 데이터 추출 완료 시 업데이트
    updateScale();
    // 약간의 지연 후 재계산 (레이아웃 렌더링 시간 고려)
    const timer = setTimeout(updateScale, 100);
    return () => {
      window.removeEventListener('resize', updateScale);
      clearTimeout(timer);
    };
  }, [extractedData]);


  const handleDataChange = (field: keyof HWPXData, value: string) => {
    if (!extractedData) return;

    let processedValue = value;
    if (field === 'ssn') {
      const numbers = value.replace(/[^\d]/g, '');
      if (numbers.length <= 6) {
        processedValue = numbers;
      } else {
        processedValue = `${numbers.slice(0, 6)}-${numbers.slice(6, 13)}`;
      }
    }

    setExtractedData({ ...extractedData, [field]: processedValue });
    // 정보가 변경되면 검증 상태 초기화
    if (['applicant', 'ssn', 'address'].includes(field)) {
      setIsVerified(false);
    }
  };

  const resetChanges = () => {
    if (originalExtractedData) {
      setExtractedData({ ...originalExtractedData });
      setIsVerified(false);
    }
  };

  const handleReview = async () => {
    if (!extractedData) return;

    // 빈값 체크 - 사용자 요청 사항 (서버 연결 에러 대신 정보 없음 알럿 노출)
    // SSN의 경우 하이픈을 제외한 숫자가 있는지 확인
    const cleanSsn = extractedData.ssn.replace(/-/g, '').trim();
    if (!extractedData.applicant.trim() || !cleanSsn) {
      showModal({
        type: 'error',
        title: '등록된 정보를 찾을 수 없습니다',
        message: '입력하신 성함과 주민등록번호가 정확한지\n다시 한번 확인해 주세요.',
        confirmLabel: '확인'
      });
      return;
    }

    setIsVerifying(true);

    try {
      // 1차 암호화 (SHA-256) 수행 - 네트워크 전송 시 원본 노출 차단
      const hashedSsn = await hashSSN(extractedData.ssn);

      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrant_name: extractedData.applicant,
          ssn: hashedSsn, // <-- 원본 대신 해시값 전송
          address: extractedData.address
        })
      });

      if (!response.ok) {
        if (response.status === 400) {
          showModal({
            type: 'error',
            title: '등록된 정보를 찾을 수 없습니다',
            message: '입력하신 성함과 주민등록번호가 정확한지\n다시 한번 확인해 주세요.',
            confirmLabel: '확인'
          });
          return;
        }
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        showModal({
          type: 'error',
          title: '등록된 정보를 찾을 수 없습니다',
          message: '입력하신 성함과 주민등록번호가 정확한지\n다시 한번 확인해 주세요.',
          confirmLabel: '확인',
          onCancel: undefined,
          cancelLabel: undefined
        });
        setIsVerifying(false);
        return;
      }

      if (result.addressMatch) {
        showModal({
          type: 'success',
          title: '정상적으로 확인되었습니다',
          message: '입력하신 정보가 데이터와 일치합니다.\n이제 증명서를 다운로드하실 수 있습니다.'
        });
        setIsVerified(true);
      } else {
        showModal({
          type: 'warning',
          title: '주소 정보가 등록된 내용과 다릅니다',
          message: (
            <div className="text-left space-y-2 mt-2">
              <div className="p-2 bg-slate-50 rounded border border-slate-100 text-xs text-slate-500">
                <span className="font-semibold block mb-1">등록된 주소:</span>
                {result.dbAddress}
              </div>
              <div className="p-2 bg-blue-50 rounded border border-blue-100 text-xs text-blue-600">
                <span className="font-semibold block mb-1">입력하신 주소:</span>
                {extractedData.address}
              </div>
              <p className="mt-4 text-sm text-center font-medium text-slate-900">
                입력하신 주소가 실제 주소와 맞습니까?
              </p>
            </div>
          ),
          confirmLabel: '예, 맞습니다',
          cancelLabel: '아니오',
          onConfirm: () => setIsVerified(true)
        });
      }

    } catch (err) {
      console.error("Verification failed:", err);
      showModal({
        type: 'error',
        title: '서버 연결 실패',
        message: '검증 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const downloadUpdatedHWPX = async () => {
    if (!originalZip || !extractedData || !originalExtractedData) return;

    try {
      const newZip = new JSZip();
      const files = Object.keys(originalZip.files);
      const editableKeys: (keyof HWPXData)[] = ['applicant', 'ssn', 'address', 'servicePeriod', 'serviceContent', 'purpose', 'issueDate'];

      // 증명서 발급일이 비어있을 경우 오늘 날짜로 자동 설정
      const finalExtractedData = { ...extractedData };
      if (!finalExtractedData.issueDate || !finalExtractedData.issueDate.trim()) {
        finalExtractedData.issueDate = getTodayKST();
      }

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        preserveOrder: false,
        trimValues: false,
        parseTagValue: false
      });
      const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        preserveOrder: false,
        format: false,
        suppressEmptyNode: true
      });

      for (const fileName of files) {
        const file = originalZip.file(fileName);
        if (!file) continue;

        if (fileName.match(/Contents\/section\d+\.xml/i)) {
          let xmlContent = await file.async("string");
          const xmlDeclarationMatch = xmlContent.match(/^<\?xml.*?\?>/);
          const xmlDeclaration = xmlDeclarationMatch ? xmlDeclarationMatch[0] : '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

          let jsonObj = parser.parse(xmlContent);

          // 1. Text Replacement
          editableKeys.forEach((k) => {
            const originalVal = originalExtractedData[k];
            const currentVal = finalExtractedData[k];
            if (originalVal && currentVal && originalVal !== currentVal) {
              jsonObj = replaceTextInObject(jsonObj, originalVal, currentVal);
            }
          });

          // 2. Address Wrapping and Paragraph Shifting (Stable Recursive Logic)
          const processSections = (obj: any): void => {
            if (typeof obj !== 'object' || obj === null) return;

            if (obj["hs:sec"] && obj["hs:sec"]["hp:p"]) {
              const paragraphs = Array.isArray(obj["hs:sec"]["hp:p"]) ? obj["hs:sec"]["hp:p"] : [obj["hs:sec"]["hp:p"]];
              let addressParagraphIndex = -1;
              let addressParagraphMaxVertpos = 0;

              for (let i = 0; i < paragraphs.length; i++) {
                const para = paragraphs[i];
                const runs = para["hp:run"] ? (Array.isArray(para["hp:run"]) ? para["hp:run"] : [para["hp:run"]]) : [];
                const isAddressPara = runs.some((run: any) =>
                  run["hp:t"] && typeof run["hp:t"] === 'string' && run["hp:t"].includes("주   소   지")
                );

                if (isAddressPara) {
                  addressParagraphIndex = i;
                  if (para["hp:linesegarray"] && para["hp:linesegarray"]["hp:lineseg"]) {
                    let linesegArray = Array.isArray(para["hp:linesegarray"]["hp:lineseg"]) ? para["hp:linesegarray"]["hp:lineseg"] : [para["hp:linesegarray"]["hp:lineseg"]];
                    const addressRun = runs.find((r: any) => r["hp:t"] && typeof r["hp:t"] === 'string' && r["hp:t"].includes("주   소   지"));
                    const addressText = addressRun["hp:t"];
                    const textLength = addressText.length;

                    const { WEIGHT_PER_LINE, LABEL_WEIGHT } = LAYOUT_CONSTANTS;
                    const baseSeg = { ...linesegArray[0] };
                    const baseHorzPos = parseInt(baseSeg["@_horzpos"] || "750");
                    const baseHorzSize = parseInt(baseSeg["@_horzsize"] || "44606");

                    // "주   소   지  :  " 라벨의 시각적 너비를 고려한 들여쓰기 계산
                    const INDENT_HWPUNIT = Math.floor((LABEL_WEIGHT / WEIGHT_PER_LINE) * baseHorzSize);

                    linesegArray = [{ ...baseSeg, "@_textpos": "0" }];
                    let currentTextPos = 0;
                    const LINE_HEIGHT = 2240;

                    const findNextWrapPos = (t: string, s: number) => {
                      // 첫 줄은 라벨 무게(20)를 포함해서 계산, 다음 줄부터는 인덴트된 너비에 맞춰 계산
                      const limit = s === 0 ? WEIGHT_PER_LINE : (WEIGHT_PER_LINE - LABEL_WEIGHT);
                      let ws = s === 0 ? LABEL_WEIGHT : 0;
                      let p = s;
                      while (p < t.length && ws < limit) { ws += getCharWeight(t[p]); p++; }

                      if (p < t.length) {
                        let fb = -1;
                        // 괄호, 쉼표, 공백 등에서 끊기 (너무 멀리(20자 이상) 가기 전까지만 확인)
                        for (let k = p; k > Math.max(s, p - 20); k--) {
                          if (t[k] === ' ' || t[k] === '(' || t[k] === ',' || t[k] === '[') { fb = k; break; }
                        }
                        if (fb !== -1) p = fb + (t[fb] === ' ' ? 1 : 0);
                      }
                      while (p < t.length && t[p] === ' ') p++;
                      return p;
                    };

                    while (currentTextPos < textLength) {
                      const nextPos = findNextWrapPos(addressText, currentTextPos);
                      if (nextPos >= textLength || nextPos <= currentTextPos) break;
                      const prevSeg = linesegArray[linesegArray.length - 1];

                      // 다음 줄부터는 들여쓰기(Hanging Indent) 적용
                      linesegArray.push({
                        ...baseSeg,
                        "@_textpos": String(nextPos),
                        "@_vertpos": String(parseInt(prevSeg["@_vertpos"] || "0") + LINE_HEIGHT),
                        "@_horzpos": String(baseHorzPos + INDENT_HWPUNIT),
                        "@_horzsize": String(baseHorzSize - INDENT_HWPUNIT),
                        "@_flags": "393216"
                      });
                      currentTextPos = nextPos;
                    }

                    para["hp:linesegarray"]["hp:lineseg"] = linesegArray;
                    para["hp:linesegarray"]["@_size"] = String(linesegArray.length);

                    addressParagraphMaxVertpos = 0;
                    for (const seg of linesegArray) {
                      const v = parseInt(seg["@_vertpos"] || "0");
                      addressParagraphMaxVertpos = Math.max(addressParagraphMaxVertpos, v + 1400);
                    }
                  }
                  break;
                }
              }

              if (addressParagraphIndex !== -1) {
                let nextParaStart = addressParagraphMaxVertpos + 2240;
                for (let i = addressParagraphIndex + 1; i < paragraphs.length; i++) {
                  const p = paragraphs[i];
                  const segs = p["hp:linesegarray"]?.["hp:lineseg"];
                  if (segs) {
                    const sArr = Array.isArray(segs) ? segs : [segs];
                    let minV = Infinity;
                    for (const s of sArr) minV = Math.min(minV, parseInt(s["@_vertpos"] || "0"));
                    if (minV < nextParaStart) {
                      const shift = nextParaStart - minV;
                      for (const s of sArr) s["@_vertpos"] = String(parseInt(s["@_vertpos"] || "0") + shift);
                    }
                    let maxV = 0;
                    for (const s of sArr) maxV = Math.max(maxV, parseInt(s["@_vertpos"] || "0") + 1400);
                    nextParaStart = maxV + 2240;
                  }
                }
              }
              obj["hs:sec"]["hp:p"] = paragraphs;
            } else {
              for (const key in obj) processSections(obj[key]);
            }
          };

          processSections(jsonObj);

          const builderOutput = builder.build(jsonObj);
          // XML 선언 중복 방지 (가장 중요한 깨짐 원인)
          const finalXml = builderOutput.trim().startsWith('<?xml') ? builderOutput : xmlDeclaration + "\r\n" + builderOutput;
          newZip.file(fileName, finalXml);
        } else {
          // 바이너리 파일은 원본 그대로 복사 (안전한 Blob 사용)
          const content = await file.async("blob");
          newZip.file(fileName, content);
        }
      }

      const blob = await newZip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${finalExtractedData.applicant}_건강보험공단제출용해촉증명서.hwpx`;
      link.click();
    } catch (err: any) {
      showModal({
        type: 'error',
        title: '다운로드 실패',
        message: 'HWPX 생성 중 오류가 발생했습니다: ' + (err.message || err)
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col items-center">
      {/* Loading Screen Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-100 rounded-full blur-2xl opacity-50 animate-pulse"></div>
            <Loader2 className="animate-spin text-blue-600 relative z-10" size={64} strokeWidth={1.5} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-2">증명서 양식을 준비하고 있습니다</h2>
          <p className="text-slate-500 font-medium">잠시만 기다려 주세요...</p>
        </div>
      )}

      {/* Error State */}
      {loadError && (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          <div className="bg-red-50 p-6 rounded-3xl border border-red-100 max-w-md w-full shadow-xl shadow-red-500/5">
            <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={40} className="text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-3">템플릿을 불러올 수 없습니다</h2>
            <p className="text-slate-600 mb-8 leading-relaxed whitespace-pre-wrap">{loadError}</p>
            <Button onClick={retryLoad} className="w-full bg-slate-900 hover:bg-slate-800 text-white h-12 rounded-xl text-base font-semibold transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2">
              <RefreshCw size={18} /> 서버에서 다시 불러오기
            </Button>
          </div>
        </div>
      )}

      <header className="w-full max-w-7xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-blue-600" /> 한글문서 편집기
          </h1>
          <p className="text-slate-500 text-sm mt-1 ml-1">
            해촉증명서 편집기
          </p>
        </div>

        {extractedData && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={resetChanges}>
              <RotateCcw size={16} /> 초기화
            </Button>

            {!isVerified ? (
              <Button variant="primary" onClick={handleReview} disabled={isVerifying} className="bg-blue-600 hover:bg-blue-700 w-44">
                {isVerifying ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                데이터 검토
              </Button>
            ) : (
              <Button variant="primary" onClick={downloadUpdatedHWPX} className="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-400 w-44">
                <Check size={18} /> 증명서 다운로드
              </Button>
            )}
          </div>
        )}
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          {extractedData && (
            <Card className="p-5 animate-in fade-in slide-in-from-left-4 duration-500">
              <SectionHeader
                title={
                  <div className="flex items-center gap-2">
                    <Edit3 size={16} className="text-blue-600" />
                    <span>증명서 내용 수정</span>
                  </div>
                }
                subtitle="미리보기는 입력값과 연동되며, 다운로드 시 원문 구조를 유지한 채 텍스트만 치환됩니다."
              />

              <div className="mt-5 space-y-3">
                {[
                  { id: 'applicant', label: '신청인' },
                  { id: 'ssn', label: '주민등록번호' },
                  { id: 'address', label: '주소지' },
                  { id: 'servicePeriod', label: '용역기간' },
                  { id: 'serviceContent', label: '용역내용' },
                  { id: 'purpose', label: '용도' },
                  { id: 'issueDate', label: '증명서 발급일' },
                ].map((field) => (
                  <div key={field.id}>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5 flex justify-between items-center">
                      <span>{field.label}</span>
                      {field.id === 'issueDate' && (
                        <span className="text-[10px] text-blue-500 font-normal bg-blue-50 px-1.5 py-0.5 rounded">자동 설정됨</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={extractedData[field.id as keyof HWPXData]}
                      onChange={(e) => handleDataChange(field.id as keyof HWPXData, e.target.value)}
                      maxLength={field.id === 'ssn' ? 14 : undefined}
                      className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                입력값은 치환 대상 텍스트에만 적용되며, 차트/표/서식 등 문서 구조는 변경되지 않습니다.
              </div>
            </Card>
          )}

          <div className="p-5 bg-blue-50/50 border border-blue-100 rounded-2xl">
            <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2 mb-2">
              <Info size={16} /> 템플릿 안내
            </h4>
            <p className="text-xs text-blue-700 leading-relaxed md:leading-6">
              표준 해촉증명서 양식이 자동으로 로드되었습니다. <br />
              좌측 입력란의 내용을 수정하면 우측 미리보기에 즉시 반영됩니다. <br />
              모든 작업이 완료되면 '증명서 다운로드' 버튼을 클릭하세요.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 h-full">
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
                  <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30">
                    템플릿 문서의 핵심 텍스트가 치환된 결과를 A4 기준으로 확인합니다.
                  </div>
                </div>
              }
            />

            <div
              ref={containerRef}
              className="mt-4 flex-1 flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 min-h-[600px] overflow-y-auto overflow-x-hidden relative scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent"
            >
              {/* Preview Content */}
              {extractedData && (
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
                          <div className="font-semibold">{extractedData.applicant}</div>
                        </div>
                        <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                          <div className="whitespace-nowrap">주 민 등 록 번 호</div>
                          <div className="text-center">:</div>
                          <div className="font-semibold">{extractedData.ssn}</div>
                        </div>
                        <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                          <div className="whitespace-nowrap flex justify-between"><span>주</span><span>소</span><span>지</span></div>
                          <div className="text-center">:</div>
                          <div className="font-semibold break-words word-break-keep-all">{extractedData.address}</div>
                        </div>
                        <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                          <div className="whitespace-nowrap flex justify-between"><span>용</span><span>역</span><span>기</span><span>간</span></div>
                          <div className="text-center">:</div>
                          <div className="font-semibold">{extractedData.servicePeriod}</div>
                        </div>
                        <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                          <div className="whitespace-nowrap flex justify-between"><span>용</span><span>역</span><span>내</span><span>용</span></div>
                          <div className="text-center">:</div>
                          <div className="font-semibold">{extractedData.serviceContent}</div>
                        </div>
                        <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                          <div className="whitespace-nowrap flex justify-between"><span>용</span><span>도</span></div>
                          <div className="text-center">:</div>
                          <div className="font-semibold">{extractedData.purpose}</div>
                        </div>
                      </div>

                      <div className="mt-[50mm] mb-[30mm] flex flex-col items-end pr-[15mm] w-full">
                        <div className="text-[15pt] font-medium mb-[40mm]">
                          위의 사실을 증명합니다.
                        </div>
                        <div className="text-[16pt] font-bold tracking-[0.1em]">
                          {extractedData.issueDate}
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
              )}


            </div>
          </Card>
        </div>
      </main>

      <footer className="w-full mt-12 py-8 text-center text-slate-400 text-xs">
        <p>미리보기에는 업체 정보가 생략되어 있으나, 다운로드 시에는 원본의 모든 정보가 포함됩니다.</p>
        <p className="mt-1">© 2025 HWPX Smart Processor • Powered by Regex-based Local Parsing</p>
      </footer>

      <Modal config={modalConfig} onClose={closeModal} />
    </div>
  );
};

export default App;