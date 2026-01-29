import React from 'react';
import { Edit3, Info } from 'lucide-react';
import Card from '../ui/Card';
import SectionHeader from '../ui/SectionHeader';
import CustomSelect from '../ui/CustomSelect';
import { HWPXData, PeriodSelection } from '../../../types';

interface EditorFormProps {
    data: HWPXData;
    periodSelection: PeriodSelection;
    onDataChange: (key: keyof HWPXData, value: string) => void;
    onPeriodChange: (key: keyof PeriodSelection, value: string) => void;
}

const EditorForm: React.FC<EditorFormProps> = ({
    data,
    periodSelection,
    onDataChange,
    onPeriodChange
}) => {
    return (
        <Card className="p-5 animate-in fade-in slide-in-from-left-4 duration-500">
            <SectionHeader
                title={
                    <div className="flex items-center gap-2">
                        <Edit3 size={16} className="text-blue-600" />
                        <span>증명서 내용 수정</span>
                    </div>
                }
                right={
                    <div className="group relative">
                        <Info size={14} className="text-slate-300 cursor-help" />
                        <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-[11px] rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-30 shadow-lg">
                            입력값은 실시간으로 미리보기에 반영되며, 다운로드 시 원본 양식 그대로 저장됩니다.
                        </div>
                    </div>
                }
            />

            <div className="mt-5 space-y-3">
                {[
                    { id: 'applicant', label: '신청인' },
                    { id: 'ssn', label: '주민등록번호' },
                    { id: 'address', label: '주소지' },
                    { id: 'servicePeriod', label: '용역기간' },
                    { id: 'serviceContent', label: '용역내용' },
                    { id: 'purpose', label: '용도' },
                ].map((field) => (
                    <div key={field.id}>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5 flex justify-between items-center">
                            <span>{field.label}</span>
                            {field.id === 'purpose' && (
                                <span className="text-[10px] text-rose-500 font-normal bg-rose-50 px-1.5 py-0.5 rounded">필수 선택</span>
                            )}
                        </label>
                        {field.id === 'servicePeriod' ? (
                            <div className="flex items-center">
                                {/* 연도 선택 */}
                                <CustomSelect
                                    className="flex-1 min-w-0 mr-4"
                                    value={periodSelection.year}
                                    onChange={(val) => onPeriodChange('year', val)}
                                    options={Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i).map(year => ({
                                        label: `${year}년`,
                                        value: year
                                    }))}
                                />

                                {/* 시작 월 */}
                                <CustomSelect
                                    className="flex-1 min-w-0 mr-1"
                                    value={periodSelection.startMonth}
                                    onChange={(val) => onPeriodChange('startMonth', val)}
                                    options={Array.from({ length: 12 }, (_, i) => i + 1).map(m => ({
                                        label: `${m}월`,
                                        value: String(m).padStart(2, '0')
                                    }))}
                                />

                                <span className="text-slate-400 font-medium shrink-0">~</span>

                                {/* 종료 월 */}
                                <CustomSelect
                                    className="flex-1 min-w-0 ml-1"
                                    value={periodSelection.endMonth}
                                    onChange={(val) => onPeriodChange('endMonth', val)}
                                    options={Array.from({ length: 12 }, (_, i) => i + 1).map(m => ({
                                        label: `${m}월`,
                                        value: String(m).padStart(2, '0')
                                    }))}
                                />
                            </div>
                        ) : field.id === 'purpose' ? (
                            <CustomSelect
                                value={data.purpose}
                                onChange={(val) => onDataChange('purpose', val)}
                                options={[
                                    { label: '국민건강보험공단', value: '국민건강보험공단' },
                                    { label: '국민연금공단', value: '국민연금공단' }
                                ]}
                                placeholder="제출 기관을 선택하세요"
                            />
                        ) : (
                            <input
                                type="text"
                                value={data[field.id as keyof HWPXData]}
                                onChange={(e) => onDataChange(field.id as keyof HWPXData, e.target.value)}
                                maxLength={field.id === 'ssn' ? 14 : undefined}
                                className="w-full px-3 py-2 border border-slate-200 bg-white rounded-lg text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                            />
                        )}
                    </div>
                ))}
            </div>


        </Card>
    );
};

export default EditorForm;
