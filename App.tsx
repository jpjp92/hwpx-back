import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { FileText, Loader2, RotateCcw, Search, AlertCircle, RefreshCw, Download, Info } from 'lucide-react';
import { HWPXData, PeriodSelection } from './types';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import Button from './src/components/ui/Button';
import Modal, { ModalConfig } from './src/components/ui/Modal';
import { hashSSN } from './src/utils/crypto';
import { replaceTextInObject } from './src/utils/xml';
import { getCharWeight, LAYOUT_CONSTANTS } from './src/utils/hwpx/layout';
import { getTodayKST } from './src/utils/date';
import { useTemplateLoader } from './src/hooks/useTemplateLoader';
import EditorForm from './src/components/forms/EditorForm';
import DocumentPreview from './src/components/preview/DocumentPreview';

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

  // 용역기간 조회 범위 선택 상태
  const [periodSelection, setPeriodSelection] = useState<PeriodSelection>({
    year: String(new Date().getFullYear()),
    startMonth: '01',
    endMonth: '12'
  });


  // 용역기간 선택 핸들러
  const handlePeriodChange = (key: keyof PeriodSelection, value: string) => {
    const newSelection = { ...periodSelection, [key]: value };
    setPeriodSelection(newSelection);

    if (extractedData) {
      // 미리보기에 선택된 범위 표시 (조회 전 상태임을 명시)
      setExtractedData({
        ...extractedData,
        servicePeriod: `${newSelection.year}년 ${newSelection.startMonth}월 ~ ${newSelection.year}년 ${newSelection.endMonth}월 (조회하여 확정)`
      });
      setIsVerified(false);
    }
  };

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

    // 1. 용도 미선택 체크
    if (!extractedData.purpose.trim()) {
      showModal({
        type: 'warning',
        title: '용도 미선택',
        message: '용도(제출 기관)를 선택해 주세요.',
        confirmLabel: '확인'
      });
      return;
    }

    // 2. 필수 정보(성함, 주민번호) 누락 체크
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
          ssn: hashedSsn,
          address: extractedData.address,
          searchRange: periodSelection // 기간 조회 조건 추가
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

      // 용역기간 조회 결과 체크 (주소 검증은 성공했어도 기간이 없을 수 있음)
      if (!result.servicePeriod) {
        showModal({
          type: 'warning',
          title: '해당 기간의 용역 이력이 없습니다',
          message: `${periodSelection.year}년 ${periodSelection.startMonth}월 ~ ${periodSelection.endMonth}월 사이에\n지급된 내역을 찾을 수 없습니다.\n기간을 다시 선택해 주세요.`,
          confirmLabel: '확인'
        });
        setIsVerifying(false); // 검증 실패 처리
        return;
      }

      // 용역기간 업데이트
      const updatedData = { ...extractedData, servicePeriod: result.servicePeriod };
      setExtractedData(updatedData);

      const PaymentDatesList = ({ dates }: { dates: string[] }) => (
        <div className="p-3 bg-slate-50 rounded border border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-2">
            확인된 지급 내역 ({dates.length}건):
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {dates.map((date, idx) => (
              <div key={idx} className="text-sm font-medium text-slate-700 flex items-center justify-between px-1">
                <span>{date}</span>
                <span className="text-xs text-slate-400">지급 완료</span>
              </div>
            ))}
          </div>
        </div>
      );

      if (result.addressMatch) {
        showModal({
          type: 'success',
          title: '정보 확인 및 기간 산출 완료',
          message: (
            <div className="text-center">
              <p className="mb-2">주소 정보가 일치하며,<br />용역기간이 자동으로 산출되었습니다.</p>
              <div className="text-blue-600 font-bold text-lg mb-2">{result.servicePeriod}</div>
              {result.paymentDates && result.paymentDates.length > 0 && (
                <div className="mt-3 text-left">
                  <div className="text-xs font-bold text-slate-700 mb-1 ml-1">상세 지급 내역</div>
                  <PaymentDatesList dates={result.paymentDates} />
                </div>
              )}
            </div>
          )
        });
        setIsVerified(true);
      } else {
        showModal({
          type: 'warning',
          title: '정보 검토가 필요합니다',
          message: (
            <div className="text-left mt-2">

              {/* Section 1: Address */}
              <div className="mb-4">
                <h5 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                  1. 주소 정보 비교
                </h5>
                <div className="space-y-2">
                  <div className="p-3 bg-slate-50 rounded border border-slate-100 text-xs text-slate-500">
                    <span className="font-semibold block mb-1">등록된 주소:</span>
                    {result.dbAddress}
                  </div>
                  <div className="p-3 bg-blue-50 rounded border border-blue-100 text-xs text-blue-600">
                    <span className="font-semibold block mb-1">입력하신 주소:</span>
                    {extractedData.address}
                  </div>
                </div>
              </div>

              {/* Section 2: Payment History */}
              <div className="mb-5">
                <h5 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                  2. 지급 내역 확인
                </h5>
                {result.paymentDates && result.paymentDates.length > 0 ? (
                  <PaymentDatesList dates={result.paymentDates} />
                ) : (
                  <div className="p-3 bg-red-50 text-red-600 text-xs rounded border border-red-100 text-center">
                    표시할 지급 내역이 없습니다.
                  </div>
                )}
              </div>

              <p className="border-t border-slate-100 pt-4 text-sm text-center font-medium text-slate-900 leading-snug">
                표시된 주소와 지급 내역이 일치합니까?
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

      // 용도 필드: 선택된 값 뒤에 " 제출" 자동 추가
      if (finalExtractedData.purpose) {
        finalExtractedData.purpose = `${finalExtractedData.purpose} 제출`;
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
            <FileText className="text-blue-600" /> 해촉증명서 편집기
          </h1>
        </div>

        {extractedData && (
          <div className="flex gap-2">
            <Button variant="destructive" onClick={resetChanges} className="w-[160px]">
              <RotateCcw size={16} /> 초기화
            </Button>

            <Button
              variant="primary"
              onClick={
                isVerified
                  ? downloadUpdatedHWPX
                  : handleReview
              }
              className={`w-[160px] ${isVerified ? "bg-green-600 hover:bg-green-700" : ""}`}
            >
              {isVerified ? (
                <>
                  <Download size={16} /> 증명서 다운로드
                </>
              ) : (
                <>
                  <Search size={16} /> 데이터 검토
                </>
              )}
            </Button>
          </div>
        )}
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          {extractedData && (
            <EditorForm
              data={extractedData}
              periodSelection={periodSelection}
              onDataChange={handleDataChange}
              onPeriodChange={handlePeriodChange}
            />
          )}

          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
              <Info size={16} className="text-blue-600" /> 편집 안내
            </h4>
            <ul className="text-xs text-slate-600 space-y-2.5">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span>
                  표준 해촉증명서 양식이 자동으로 적용되었습니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span className="leading-relaxed">
                  <span className="font-semibold text-slate-700">용역기간</span> 선택 시 날짜가 자동 입력되며, <span className="font-semibold text-slate-700">용도(제출 기관)</span>는 필수 선택 사항입니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span className="leading-relaxed">
                  입력하신 내용은 <span className="text-blue-600 font-bold">글자만 변경</span>되며,
                  문서의 표나 서식은 <span className="text-slate-900 font-bold">그대로 유지</span>됩니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <span>
                  상단의 <b>[데이터 검토]</b> 완료 후, 활성화된 <b className="text-green-600">[증명서 다운로드]</b> 버튼을 눌러 파일을 저장하세요.
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-7 h-full">
          {extractedData && (
            <DocumentPreview data={extractedData} />
          )}
        </div>
      </main>


      <footer className="mt-16 py-8 text-center text-slate-400 text-sm">
        <p>© 2025 HWPX Smart Editor</p>
      </footer>

      <Modal config={modalConfig} onClose={closeModal} />
    </div >
  );
};

export default App;