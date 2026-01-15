import React from 'react';

interface SectionHeaderProps {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, right }) => (
    <div className="flex items-start justify-between gap-3">
        <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500 leading-relaxed">{subtitle}</p>}
        </div>
        {right}
    </div>
);

export default SectionHeader;
