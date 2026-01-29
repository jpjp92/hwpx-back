import React from 'react';

interface ButtonProps {
    variant?: "primary" | "secondary" | "destructive";
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
    variant = "secondary",
    disabled,
    className = "",
    children,
    ...props
}) => {
    const base =
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 h-11";

    let variantStyles = "";
    switch (variant) {
        case "primary":
            variantStyles = "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400 disabled:bg-blue-300 border border-transparent";
            break;
        case "destructive":
            // 버건디(Rose) 톤의 텍스트 + 회색 테두리
            variantStyles = "bg-white text-rose-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 focus:ring-rose-200 disabled:text-rose-300";
            break;
        case "secondary":
        default:
            variantStyles = "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus:ring-slate-300 disabled:text-slate-300";
            break;
    }

    return (
        <button
            {...props}
            disabled={disabled}
            className={`${base} ${variantStyles} ${disabled ? "cursor-not-allowed" : ""} ${className}`}
        >
            {children}
        </button>
    );
};

export default Button;
