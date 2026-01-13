import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Upload, FileText, Edit3, Loader2, CheckCircle2, AlertCircle, Save, RotateCcw, Info, Calendar, Zap } from 'lucide-react';
import { HWPXData, ProcessingState, FileInfo } from './types';
import { parseHWPXContent } from './services/geminiService';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// XML 객체를 재귀적으로 탐색하여 텍스트 값을 정밀하게 치환하는 함수
const replaceTextInObject = (obj: any, originalVal: string, currentVal: string) => {
  if (!obj) return;

  if (typeof obj === 'string') {
    // 문자열인 경우에만 치환 수행 (내용이 정확히 일치하거나 포함된 경우)
    return obj.split(originalVal).join(currentVal);
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = replaceTextInObject(obj[i], originalVal, currentVal);
    }
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // HWPX의 텍스트 노드는 주로 '#text' 또는 특정 태그 내부의 문자열로 존재함
        obj[key] = replaceTextInObject(obj[key], originalVal, currentVal);
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
        preserveOrder: true
      });
      const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        preserveOrder: true,
        format: true
      });

      for (const fileName of files) {
        const file = originalZip.file(fileName);
        if (!file) continue;

        if (fileName.match(/Contents\/section\d+\.xml/i)) {
          let xmlContent = await file.async("string");

          // XML을 객체로 파싱
          let jsonObj = parser.parse(xmlContent);

          editableKeys.forEach((k) => {
            const originalVal = originalExtractedData[k];
            const currentVal = extractedData[k];

            if (originalVal && currentVal && originalVal !== currentVal) {
              // 객체 내부를 재귀적으로 탐색하며 텍스트만 치환
              jsonObj = replaceTextInObject(jsonObj, originalVal, currentVal);
            }
          });

          // 다시 XML 문자열로 변환
          const updatedXml = builder.build(jsonObj);
          newZip.file(fileName, updatedXml);
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
                        className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm outline-none ${field.id === 'issueDate' ? 'bg-amber-50/50 border-amber-100 font-bold text-amber-900' : ''}`}
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

        <div className="lg:col-span-8">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 min-h-[900px] p-[80px] relative overflow-hidden">
            {!extractedData && !status.isParsing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 px-12 text-center">
                <FileText size={80} className="mb-4 opacity-10" />
                <p className="text-lg font-medium">문서 미리보기가 이곳에 나타납니다</p>
                <p className="text-sm text-slate-400 mt-2">HWPX 문서를 업로드하면 Gemini 2.5 Flash가 자동으로 분석을 시작합니다.</p>
              </div>
            )}

            {status.isParsing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 z-20 backdrop-blur-sm">
                <div className="relative mb-6">
                  <Loader2 className="animate-spin text-blue-500" size={64} />
                  <div className="absolute inset-0 animate-ping opacity-20 bg-blue-400 rounded-full scale-150"></div>
                </div>
                <p className="text-2xl font-bold text-slate-800">Gemini 2.5 Flash가 분석 중...</p>
                <p className="text-slate-400 mt-3 font-medium animate-pulse">{loadingMsg}</p>
                <div className="mt-8 w-64 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 animate-[loading_20s_ease-in-out_infinite]"></div>
                </div>
                <style dangerouslySetInnerHTML={{
                  __html: `
                  @keyframes loading {
                    0% { width: 0%; }
                    50% { width: 70%; }
                    100% { width: 95%; }
                  }
                `}} />
              </div>
            )}

            {extractedData && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
                <div className="text-center mb-24">
                  <h1 className="text-5xl font-extrabold tracking-[20px] text-slate-900 border-b-4 border-slate-900 pb-6 inline-block">
                    해 촉 증 명 서
                  </h1>
                </div>

                <div className="space-y-6 text-lg">
                  <div className="flex gap-4">
                    <span className="w-32 font-bold shrink-0">신청인:</span>
                    <span className="border-b border-slate-300 flex-1 pb-1">{extractedData.applicant}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="w-32 font-bold shrink-0">주민등록번호:</span>
                    <span className="border-b border-slate-300 flex-1 pb-1">{extractedData.ssn}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="w-32 font-bold shrink-0">주소지:</span>
                    <span className="border-b border-slate-300 flex-1 pb-1 text-blue-700 font-medium bg-blue-50/30">{extractedData.address}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="w-32 font-bold shrink-0">용역기간:</span>
                    <span className="border-b border-slate-300 flex-1 pb-1">{extractedData.servicePeriod}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="w-32 font-bold shrink-0">용역내용:</span>
                    <span className="border-b border-slate-300 flex-1 pb-1">{extractedData.serviceContent}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="w-32 font-bold shrink-0">용도:</span>
                    <span className="border-b border-slate-300 flex-1 pb-1">{extractedData.purpose}</span>
                  </div>
                </div>

                <div className="mt-32 text-right">
                  <p className="text-xl font-medium">위의 사실을 증명합니다.</p>
                </div>

                <div className="mt-40 text-center">
                  <p className="text-3xl font-bold tracking-widest bg-amber-50 px-6 py-2 rounded-xl inline-block border border-amber-100 shadow-sm text-amber-900">
                    {extractedData.issueDate}
                  </p>
                </div>

                <div className="absolute top-0 left-0 w-24 h-24 border-t-2 border-l-2 border-slate-100"></div>
                <div className="absolute top-0 right-0 w-24 h-24 border-t-2 border-r-2 border-slate-100"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 border-b-2 border-l-2 border-slate-100"></div>
                <div className="absolute bottom-0 right-0 w-24 h-24 border-b-2 border-r-2 border-slate-100"></div>
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
