import { useToasts, type Toast, type ToastType } from '../hooks/useToast'

const typeStyles: Record<ToastType, string> = {
    success: 'bg-gradient-to-r from-green-500 to-green-600',
    error: 'bg-gradient-to-r from-red-500 to-red-600',
    info: 'bg-gradient-to-r from-primary to-[#e05a80]',
    warning: 'bg-gradient-to-r from-amber-500 to-amber-600',
}

export default function ToastContainer() {
    const toasts = useToasts()

    return (
        <div className="fixed top-5 right-5 z-[100] pointer-events-none">
            {toasts.map((toast: Toast) => (
                <div
                    key={toast.id}
                    className={`
            px-6 py-3 rounded-xl text-white mb-2 text-sm font-medium
            shadow-lg backdrop-blur-lg pointer-events-auto
            ${typeStyles[toast.type]}
            ${toast.hiding ? 'toast-exit' : 'toast-enter'}
          `}
                >
                    {toast.message}
                </div>
            ))}
        </div>
    )
}
