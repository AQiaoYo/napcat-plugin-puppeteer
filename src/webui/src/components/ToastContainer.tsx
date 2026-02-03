import { useToasts, type Toast, type ToastType } from '../hooks/useToast'

const typeStyles: Record<ToastType, string> = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-gray-800 text-white dark:bg-white dark:text-black',
    warning: 'bg-amber-600 text-white',
}

export default function ToastContainer() {
    const toasts = useToasts()

    return (
        <div className="fixed top-5 right-5 z-[100] pointer-events-none flex flex-col items-end gap-2">
            {toasts.map((toast: Toast) => (
                <div
                    key={toast.id}
                    className={`
            px-4 py-3 rounded-md shadow-md pointer-events-auto border border-white/10
            flex items-center gap-2 min-w-[200px] max-w-[400px]
            text-sm font-medium
            ${typeStyles[toast.type]}
            ${toast.hiding ? 'opacity-0 translate-x-4 transition-all duration-300' : 'animate-in slide-in-from-right-8 fade-in duration-300'}
          `}
                >
                    {toast.message}
                </div>
            ))}
        </div>
    )
}
