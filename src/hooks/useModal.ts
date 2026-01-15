import { useState } from 'react';
import { ModalConfig } from '../components/ui/Modal';

export const useModal = () => {
    const [modalConfig, setModalConfig] = useState<ModalConfig>({
        isOpen: false,
        type: 'info',
        title: '',
        message: '',
    });

    const showModal = (config: Partial<ModalConfig>) => {
        // 이전 모달의 설정(버튼 라벨, 콜백 등)이 남지 않도록 초기화 후 적용
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

    return {
        modalConfig,
        showModal,
        closeModal,
    };
};
