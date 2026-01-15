import React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import Button from './Button';

export interface ModalConfig {
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: React.ReactNode;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
}

interface ModalProps {
    config: ModalConfig;
    onClose: () => void;
}

const Modal: React.FC<ModalProps> = ({ config, onClose }) => {
    if (!config.isOpen) return null;

    const icons = {
        success: <CheckCircle2 className="w-12 h-12 text-emerald-500" />,
        error: <AlertCircle className="w-12 h-12 text-rose-500" />,
        warning: <AlertTriangle className="w-12 h-12 text-amber-500" />,
        info: <Info className="w-12 h-12 text-blue-500" />,
    };

    const colors = {
        success: "bg-emerald-50",
        error: "bg-rose-50",
        warning: "bg-amber-50",
        info: "bg-blue-50",
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6 text-center">
                    <div className={`mx-auto w-16 h-16 rounded-full ${colors[config.type]} flex items-center justify-center mb-4`}>
                        {icons[config.type]}
                    </div>

                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                        {config.title}
                    </h3>

                    <div className="text-sm text-slate-600 whitespace-pre-line">
                        {config.message}
                    </div>
                </div>

                <div className="flex gap-2 p-4 border-t border-slate-100">
                    {(config.onCancel || config.cancelLabel) && (
                        <Button
                            variant="secondary"
                            className="flex-1 !h-12"
                            onClick={() => {
                                config.onCancel?.();
                                onClose();
                            }}
                        >
                            {config.cancelLabel || "취소"}
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        className="flex-1 !h-12"
                        onClick={() => {
                            config.onConfirm?.();
                            onClose();
                        }}
                    >
                        {config.confirmLabel || "확인"}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default Modal;
