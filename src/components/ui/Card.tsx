import React from 'react';

interface CardProps {
    className?: string;
    children: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ className = "", children }) => (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
        {children}
    </section>
);

export default Card;
