import React, { useEffect, useRef } from 'react';
import { useNotebookStore } from '../notebook-store';
import {
    CheckCircleIcon,
    InformationCircleIcon,
    ExclamationTriangleIcon,
    XCircleIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';

const CircularProgress = ({ progress, size = 24, strokeWidth = 2.5 }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    // Change color based on remaining time
    const getProgressColor = () => {
        if (progress > 30) return 'text-blue-400';
        if (progress > 15) return 'text-yellow-400';
        return 'text-red-400';
    };

    // Add pulsing animation when time is running out
    const isPulsing = progress < 20;

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg
                className={`transform -rotate-90 ${isPulsing ? 'animate-pulse' : ''}`}
                width={size}
                height={size}
            >
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-zinc-600 opacity-20"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className={`${getProgressColor()} transition-all duration-100 ease-linear`}
                    strokeLinecap="round"
                />
            </svg>
            {/* Center dot indicator */}
            <div
                className={`absolute w-1.5 h-1.5 rounded-full ${getProgressColor().replace('text-', 'bg-')} ${isPulsing ? 'animate-ping' : ''}`}
            />
        </div>
    );
};

const NotificationToast = ({ notification }) => {
    const removeNotification = useNotebookStore(state => state.removeNotification);
    const timerRef = useRef(null);
    const progressRef = useRef(null);
    const [isVisible, setIsVisible] = React.useState(false);
    const [progress, setProgress] = React.useState(100);

    useEffect(() => {
        // Trigger animation after mount
        setTimeout(() => setIsVisible(true), 10);

        if (notification.timeout) {
            const startTime = Date.now();
            const duration = notification.timeout;

            // Update progress every 50ms for smooth animation
            progressRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, duration - elapsed);
                const newProgress = (remaining / duration) * 100;

                if (newProgress <= 0) {
                    clearInterval(progressRef.current);
                    setIsVisible(false);
                    setTimeout(() => removeNotification(notification.id), 300);
                } else {
                    setProgress(newProgress);
                }
            }, 50);

            timerRef.current = setTimeout(() => {
                setIsVisible(false);
                setTimeout(() => removeNotification(notification.id), 300);
            }, notification.timeout);
        }

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            if (progressRef.current) {
                clearInterval(progressRef.current);
            }
        };
    }, [notification, removeNotification]);

    const getIcon = () => {
        switch (notification.type) {
            case 'success':
                return <CheckCircleIcon className="w-5 h-5 text-green-400" />;
            case 'warning':
                return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400" />;
            case 'error':
                return <XCircleIcon className="w-5 h-5 text-red-400" />;
            default:
                return <InformationCircleIcon className="w-5 h-5 text-blue-400" />;
        }
    };

    const getStyles = () => {
        switch (notification.type) {
            case 'success':
                return 'bg-green-900/90 border-green-700';
            case 'warning':
                return 'bg-yellow-900/90 border-yellow-700';
            case 'error':
                return 'bg-red-900/90 border-red-700';
            default:
                return 'bg-zinc-800/90 border-zinc-700';
        }
    };

    const handleActionClick = () => {
        if (notification.action && notification.action.handler) {
            notification.action.handler();
            // Clear the timers since action was taken
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
            if (progressRef.current) {
                clearInterval(progressRef.current);
            }
            setIsVisible(false);
            setTimeout(() => removeNotification(notification.id), 300);
        }
    };

    const handleDismiss = () => {
        if (progressRef.current) {
            clearInterval(progressRef.current);
        }
        setIsVisible(false);
        setTimeout(() => removeNotification(notification.id), 300);
    };

    return (
        <div
            className={`
                flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm
                shadow-xl transition-all duration-300 ease-out min-w-[320px]
                ${getStyles()}
                ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
                ${progress < 20 ? 'animate-pulse' : ''}
            `}
        >
            {getIcon()}
            <div className="flex-1 text-sm text-gray-100">
                {notification.message}
            </div>
            {notification.action && (
                <button
                    onClick={handleActionClick}
                    className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                >
                    {notification.action.label}
                </button>
            )}
            <div className="flex items-center gap-3">
                {notification.timeout && (
                    <div className="relative group">
                        <CircularProgress progress={progress} size={24} strokeWidth={2.5} />
                        {/* Hover tooltip showing remaining seconds */}
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-zinc-700 text-xs text-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                            {Math.ceil((progress / 100) * (notification.timeout / 1000))}s remaining
                        </div>
                    </div>
                )}
                <button
                    onClick={handleDismiss}
                    className="p-1.5 hover:bg-zinc-700/50 rounded-lg transition-all hover:scale-110"
                    aria-label="Dismiss"
                >
                    <XMarkIcon className="w-4 h-4 text-gray-400 hover:text-gray-200" />
                </button>
            </div>
        </div>
    );
};

export const NotificationContainer = () => {
    // Use selectors to only subscribe to notifications
    const notifications = useNotebookStore(state => state.notifications);
    const clearOldNotifications = useNotebookStore(state => state.clearOldNotifications);

    // Only run cleanup interval when there are notifications with timeouts
    useEffect(() => {
        // Check if there are any notifications with timeouts
        const hasTimedNotifications = notifications.some(n => n.timeout);

        if (!hasTimedNotifications) {
            return; // No interval needed
        }

        const interval = setInterval(() => {
            clearOldNotifications();
        }, 1000);

        return () => clearInterval(interval);
    }, [notifications, clearOldNotifications]);

    if (notifications.length === 0) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 max-w-md">
            {notifications.map(notification => (
                <NotificationToast
                    key={notification.id}
                    notification={notification}
                />
            ))}
        </div>
    );
};

export default NotificationToast;