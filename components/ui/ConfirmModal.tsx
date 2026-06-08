import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon } from './Icon';

interface ConfirmModalProps {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title?: string;
    message: string;
    confirmLabel?: string;
    confirmVariant?: 'danger' | 'warning' | 'primary';
}

/**
 * Modal de confirmation non-bloquant remplaçant window.confirm().
 *
 * Phase 3A 2026-05 : refactorisé sur la primitive <Modal> + <Button>.
 * Comportement identique aux consumers (signature inchangée).
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onConfirm,
    onCancel,
    title = 'Confirmation',
    message,
    confirmLabel = 'Confirmer',
    confirmVariant = 'danger',
}) => {
    const variantToButton: Record<typeof confirmVariant, 'danger' | 'primary'> = {
        danger: 'danger',
        warning: 'primary',
        primary: 'primary',
    };
    const icon = <Icon name={confirmVariant === 'danger' ? 'alert' : 'status'} size={20} className={confirmVariant === 'danger' ? 'text-danger-400' : 'text-info-400'} />;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            title={title}
            icon={icon}
            size="sm"
            footer={
                <>
                    <Button onClick={onCancel} variant="ghost" size="sm">Annuler</Button>
                    <Button onClick={onConfirm} variant={variantToButton[confirmVariant]} size="sm">
                        {confirmLabel}
                    </Button>
                </>
            }
        >
            <p className="text-body text-ink-300 leading-relaxed whitespace-pre-line">{message}</p>
        </Modal>
    );
};
