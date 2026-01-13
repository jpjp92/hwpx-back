import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { Upload, FileText, Edit3, Loader2, CheckCircle2, AlertCircle, Save, RotateCcw, Info, Calendar, Zap, FileType } from 'lucide-react';
import { HWPXData, ProcessingState, FileInfo } from './types';
import { parseHWPXContent } from './services/geminiService';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// XML 객체를 재귀적으로 탐색하여 텍스트 값을 정밀하게 치환하는 함수
const replaceTextInObject = (obj: any, originalVal: string, currentVal: string): any => {
  // null 또는 undefined는 그대로 반환하여 구조를 유지함
  if (obj === null || obj === undefined) return obj;

  const objType = typeof obj;

  if (objType === 'string') {
    // 문자열인 경우에만 치환 수행
    return obj.split(originalVal).join(currentVal);
  }

  if (Array.isArray(obj)) {
    // 배열인 경우 모든 요소를 순회하며 치환
    for (let i = 0; i < obj.length; i++) {
      const result = replaceTextInObject(obj[i], originalVal, currentVal);
      // 결과가 undefined가 아닌 경우에만 할당 (방어적 처리)
      if (result !== undefined) {
        obj[i] = result;
      }
    }
  } else if (objType === 'object') {
    // 객체인 경우 모든 속성을 순회하며 치환
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // HWPX의 구조를 결정하는 속성(Attribute, @_로 시작)은 치환에서 제외하여 서식 깨짐 방지
        if (key.startsWith('@_')) continue;

        const result = replaceTextInObject(obj[key], originalVal, currentVal);
        if (result !== undefined) {
          obj[key] = result;
        }
      }
    }
  }
  return obj;
};

const App: React.FC = () => {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [extractedData, setExtractedData] = useState<HWPXData | null>(null);
  const [originalExtractedData, setOriginalExtractedData] = useState<HWPXData | null>(null);
  const [originalZip, setOriginalZip] = useState<JSZip | null>(null);
  const [status, setStatus] = useState<ProcessingState>({
    isUnzipping: false,
    isParsing: false,
    error: null,
  });

  const [loadingMsg, setLoadingMsg] = useState("문서 구조를 파악하고 있습니다...");
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

  useEffect(() => {
    let interval: any;
    if (status.isParsing) {
      const messages = [
        "Gemini 2.5 Flash가 XML 데이터를 읽고 있습니다...",
        "텍스트 영역에서 핵심 정보를 추출 중입니다...",
        "신청인 및 업체 정보를 매핑하고 있습니다...",
        "거의 다 되었습니다. 결과를 정리 중입니다..."
      ];
      let i = 0;
      interval = setInterval(() => {
        setLoadingMsg(messages[i % messages.length]);
        i++;
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [status.isParsing]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    if (uploadedFile.name.endsWith('.hwp')) {
      setStatus(prev => ({
        ...prev,
        error: "이 프로그램은 .hwpx 형식만 지원합니다. .hwp 파일을 한글 프로그램에서 '다른 이름으로 저장'을 통해 '.hwpx'로 변환 후 업로드해주세요."
      }));
      setFileInfo(null);
      setExtractedData(null);
      return;
    }

    if (!uploadedFile.name.endsWith('.hwpx')) {
      setStatus(prev => ({ ...prev, error: "지원하지 않는 파일 형식입니다. .hwpx 파일을 업로드해주세요." }));
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

  const handleDataChange = (field: keyof HWPXData, value: string) => {
    if (!extractedData) return;
    setExtractedData({ ...extractedData, [field]: value });
  };

  const resetChanges = () => {
    if (originalExtractedData) {
      setExtractedData({ ...originalExtractedData });
    }
  };

  const downloadUpdatedHWPX = async () => {
    if (!originalZip || !extractedData || !originalExtractedData) return;

    try {
      const newZip = new JSZip();
      const files = Object.keys(originalZip.files);
      const editableKeys: (keyof HWPXData)[] = ['applicant', 'ssn', 'address', 'servicePeriod', 'serviceContent', 'purpose', 'issueDate'];

      // XML 파서 및 빌더 초기화
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        preserveOrder: true,
        trimValues: false, // 텍스트 노드의 앞뒤 공백(들여쓰기 등)을 보존하기 위해 트림 기능 비활성화
        parseTagValue: false // 숫자 형태의 텍스트를 Number로 자동 변환하지 않도록 설정 (주민등록번호 등 보호)
      });
      const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        preserveOrder: true,
        format: false // HWPX 내부의 미세 공백 구조 보존을 위해 포맷팅 비활성화
      });

      for (const fileName of files) {
        const file = originalZip.file(fileName);
        if (!file) continue;

        if (fileName.match(/Contents\/section\d+\.xml/i)) {
          let xmlContent = await file.async("string");

          // 원본 XML 선언부 추출 (<?xml ... ?>)
          const xmlDeclarationMatch = xmlContent.match(/^<\?xml.*?\?>/);
          const xmlDeclaration = xmlDeclarationMatch ? xmlDeclarationMatch[0] : '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';

          // XML을 객체로 파싱
          let jsonObj = parser.parse(xmlContent);

          editableKeys.forEach((k) => {
            const originalVal = originalExtractedData[k];
            const currentVal = extractedData[k];

            if (originalVal && currentVal && originalVal !== currentVal) {
              jsonObj = replaceTextInObject(jsonObj, originalVal, currentVal);
            }
          });

          // 다시 XML 문자열로 변환
          const builderOutput = builder.build(jsonObj);

          // 빌더 출력물에 이미 선언부가 있는지 확인 (중복 방지)
          let finalXml = "";
          if (builderOutput.trim().startsWith('<?xml')) {
            finalXml = builderOutput;
          } else {
            // 선언부와 본문 사이에 줄바꿈(\r\n)을 추가하여 HWPX 호환성 극대화
            finalXml = xmlDeclaration + "\r\n" + builderOutput;
          }

          newZip.file(fileName, finalXml);
        } else {
          const content = await file.async("blob");
          newZip.file(fileName, content);
        }
      }

      const blob = await newZip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `[수정완료]_${fileInfo?.name || 'document.hwpx'}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("HWPX 생성 중 오류가 발생했습니다: " + err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex flex-col items-center">
      <header className="w-full max-w-7xl mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-blue-600" /> HWPX AI 스마트 편집기
          </h1>
          <p className="text-slate-500 text-sm flex items-center gap-1">
            해촉증명서 데이터 치환 시스템 <span className="text-blue-400 font-bold ml-2 flex items-center gap-0.5"><Zap size={12} /> 데모 테스트 </span>
          </p>
        </div>

        {extractedData && (
          <div className="flex gap-2">
            <button
              onClick={resetChanges}
              className="px-4 py-2 bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <RotateCcw size={16} /> 초기화
            </button>
            <button
              onClick={downloadUpdatedHWPX}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-bold shadow-lg shadow-blue-200"
            >
              <Save size={18} /> 수정된 HWPX 다운로드
            </button>
          </div>
        )}
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">1. 문서 업로드</h2>
              <div className="group relative">
                <Info size={14} className="text-slate-300 cursor-help" />
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30">
                  .hwp 구버전은 지원하지 않습니다. 한글에서 'HWPX'로 변환 후 사용해 주세요.
                </div>
              </div>
            </div>

            {!fileInfo ? (
              <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center bg-slate-50 hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer">
                <input type="file" accept=".hwpx" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                <Upload className="text-slate-300 mb-2" size={32} />
                <p className="text-sm text-slate-600 font-medium text-center">HWPX 파일을 선택하세요</p>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <div className="bg-blue-500 p-2 rounded-lg text-white"><FileText size={20} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{fileInfo.name}</p>
                  <p className="text-xs text-slate-500">{(fileInfo.size / 1024).toFixed(1)} KB</p>
                </div>
                {status.isParsing ? (
                  <Loader2 className="animate-spin text-blue-500" size={18} />
                ) : (
                  <CheckCircle2 className="text-green-500" size={18} />
                )}
              </div>
            )}

            {status.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg flex items-start gap-2 text-xs leading-relaxed">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{status.error}</span>
              </div>
            )}
          </section>

          {extractedData && (
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
              <div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Edit3 size={16} className="text-blue-500" /> 2. 증명서 내용 수정
                </h2>
                <div className="space-y-3">
                  {[
                    { id: 'applicant', label: '신청인' },
                    { id: 'ssn', label: '주민등록번호' },
                    { id: 'address', label: '주소지' },
                    { id: 'servicePeriod', label: '용역기간' },
                    { id: 'serviceContent', label: '용역내용' },
                    { id: 'purpose', label: '용도' },
                    { id: 'issueDate', label: '증명서 발급일', icon: <Calendar size={14} className="inline mr-1" /> },
                  ].map((field) => (
                    <div key={field.id} className="group">
                      <label className="block text-[11px] font-bold text-slate-400 mb-1 group-focus-within:text-blue-500 transition-colors">
                        {field.icon}{field.label}
                      </label>
                      <input
                        type="text"
                        value={extractedData[field.id as keyof HWPXData]}
                        onChange={(e) => handleDataChange(field.id as keyof HWPXData, e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm outline-none font-medium"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                  💡 발급 날짜와 신청인 정보를 수정할 수 있습니다. 하단 업체 정보는 원본 데이터가 유지됩니다.
                </p>
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-8 h-full">
          <div
            ref={containerRef}
            className="flex flex-col h-full min-h-[800px] bg-slate-100 rounded-2xl shadow-sm overflow-hidden relative border border-slate-200 p-8 items-center justify-center"
          >
            {/* Loading Overlay */}
            {(status.isUnzipping || status.isParsing) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-50 backdrop-blur-sm transition-all duration-500">
                <div className="w-full max-w-md px-8 flex flex-col items-center">
                  <div className="relative mb-8">
                    <div className="w-20 h-20 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 animate-ping opacity-20 bg-blue-500 rounded-full scale-125"></div>
                  </div>

                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-4">
                    <div className="bg-blue-600 h-full w-full origin-left animate-[loading-bar_1.5s_infinite_ease-in-out]"></div>
                  </div>

                  <p className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                    {status.isUnzipping ? "문서 압축 해제 중..." : "AI 데이터 분석 중..."}
                  </p>
                  <p className="text-slate-500 mt-2 font-medium animate-pulse tracking-wide h-6">
                    {status.isParsing ? loadingMsg : "HWPX 파일 구조를 탐색하고 있습니다."}
                  </p>
                </div>
              </div>
            )}

            {/* Placeholder (Empty State) */}
            {!fileInfo && !status.isParsing && !status.isUnzipping && (
              <div className="text-center space-y-4 opacity-50 select-none">
                <div className="w-24 h-24 bg-white rounded-3xl mx-auto flex items-center justify-center shadow-sm border border-slate-200">
                  <FileType size={40} className="text-slate-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-600">실시간 인터랙티브 미리보기</h3>
                  <p className="text-sm text-slate-500 mt-1">HWPX 원본 데이터를 Gemini가 정밀 분석하여<br />실제 문서와 동일한 레이아웃으로 렌더링합니다.</p>
                </div>
              </div>
            )}

            {/* Preview Content */}
            {extractedData && (
              <div
                className="origin-top transition-transform duration-300 shadow-xl ring-1 ring-slate-900/5 mb-12"
                style={{ transform: `scale(${scale})` }}
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

                    <div className="space-y-[12mm] text-[15pt] pl-[15mm] pr-[15mm]">
                      <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                        <div className="whitespace-nowrap flex justify-between h-full"><span>신</span><span>청</span><span>인</span></div>
                        <div className="text-center">:</div>
                        <div className="font-semibold">{extractedData.applicant}</div>
                      </div>
                      <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                        <div className="whitespace-nowrap">주민등록번호</div>
                        <div className="text-center">:</div>
                        <div className="font-semibold">{extractedData.ssn}</div>
                      </div>
                      <div className="grid grid-cols-[40mm_10mm_1fr] items-start leading-[1.6]">
                        <div className="whitespace-nowrap flex justify-between"><span>주</span><span>소</span><span>지</span></div>
                        <div className="text-center">:</div>
                        <div className="font-semibold">{extractedData.address}</div>
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

            {extractedData && (
              <div className="absolute bottom-8 right-8 bg-blue-600 text-white px-5 py-2.5 rounded-full flex items-center gap-3 text-xs font-black shadow-2xl z-30 animate-in fade-in slide-in-from-bottom-4 shadow-blue-500/40">
                <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-ping"></div>
                LIVE SYNC ACTIVE (A4 ISO 216)
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="w-full mt-12 py-8 text-center text-slate-400 text-xs">
        <p>미리보기에는 업체 정보가 생략되어 있으나, 다운로드 시에는 원본의 모든 정보가 포함됩니다.</p>
        <p className="mt-1">© 2025 AI HWPX Smart Processor • Powered by Gemini 2.5 Flash (Latency Optimized)</p>
      </footer>
    </div>
  );
};

export default App;
