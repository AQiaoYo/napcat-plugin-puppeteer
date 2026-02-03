import { useSyncExternalStore } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
    id: number
    message: string
    type: ToastType
    hiding?: boolean
}

// 简单的全局状态管理
let toasts: Toast[] = []
let toastId = 0
const listeners = new Set<() => void>()

function emitChange() {
    listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function getSnapshot() {
    return toasts
}

export function addToast(message: string, type: ToastType = 'info') {
    const id = ++toastId
    toasts = [...toasts, { id, message, type }]
    emitChange()

    // 自动移除
    setTimeout(() => {
        toasts = toasts.map(t => t.id === id ? { ...t, hiding: true } : t)
        emitChange()
        setTimeout(() => {
            toasts = toasts.filter(t => t.id !== id)
            emitChange()
        }, 400)
    }, 3000)
}

export function useToasts() {
    return useSyncExternalStore(subscribe, getSnapshot)
}

// 便捷函数
export const showToast = (message: string, type: ToastType = 'info') => {
    addToast(message, type)
}