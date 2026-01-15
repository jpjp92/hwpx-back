import React from 'react';

interface ButtonProps {
    variant?: "primary" | "secondary";
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
    const styles =
        variant === "primary"
            ? "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400 disabled:bg-blue-300 border border-transparent"
            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus:ring-slate-300 disabled:text-slate-300";

    return (
        <button
            {...props}
            disabled={disabled}
            className={`${base} ${styles} ${disabled ? "cursor-not-allowed" : ""} ${className}`}
        >
            {children}
        </button>
    );
};

export default Button;
