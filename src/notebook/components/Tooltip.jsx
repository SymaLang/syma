import React, { useState, cloneElement, Children } from 'react';
import {
    autoUpdate,
    flip,
    offset,
    shift,
    useFloating,
    useFocus,
    useHover,
    useInteractions,
    useRole,
    arrow,
    FloatingArrow,
} from '@floating-ui/react';
// Design tokens removed - using Tailwind classes directly

export function Tooltip({
    children,
    content,
    delay = 500,
    placement = 'top',
}) {
    const [isOpen, setIsOpen] = useState(false);
    const arrowRef = React.useRef(null);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        placement,
        middleware: [
            offset(10),
            flip(),
            shift({ padding: 8 }),
            arrow({ element: arrowRef })
        ],
        whileElementsMounted: autoUpdate,
    });

    const hover = useHover(context, {
        delay: { open: delay, close: 100 },
        restMs: 40,
    });

    const focus = useFocus(context);
    const role = useRole(context, { role: 'tooltip' });

    const { getReferenceProps, getFloatingProps } = useInteractions([
        hover,
        focus,
        role,
    ]);

    if (!content) return <>{children}</>;

    return (
        <>
            {cloneElement(Children.only(children), {
                ref: refs.setReference,
                ...getReferenceProps(),
            })}

            {isOpen && (
                <div
                    ref={refs.setFloating}
                    style={{
                        ...floatingStyles,
                        zIndex: 9999,
                    }}
                    {...getFloatingProps()}
                >
                    <div className="bg-zinc-800 text-white px-3 py-2 rounded-lg text-sm font-medium border border-zinc-700 shadow-xl backdrop-blur max-w-[250px] transition-opacity duration-150">
                        {content}
                        <FloatingArrow
                            ref={arrowRef}
                            context={context}
                            fill="#27272a"
                            stroke="#3f3f46"
                            strokeWidth={1}
                        />
                    </div>
                </div>
            )}
        </>
    );
}

// Compound component for keyboard shortcuts
export function KeyboardShortcut({ keys }) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    const formatKey = (key) => {
        if (key === 'cmd' || key === 'meta') return isMac ? '⌘' : 'Ctrl';
        if (key === 'shift') return '⇧';
        if (key === 'alt') return isMac ? '⌥' : 'Alt';
        if (key === 'enter') return '⏎';
        if (key === 'delete') return '⌫';
        if (key === 'backspace') return '⌫';
        if (key === 'escape') return 'Esc';
        if (key === 'double-click') return 'Double-click';
        return key.toUpperCase();
    };

    return (
        <span className="inline-flex gap-1 ml-2">
            {keys.map((key, i) => (
                <kbd
                    key={i}
                    className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-inherit text-gray-400 shadow-sm"
                >
                    {formatKey(key.toLowerCase())}
                </kbd>
            ))}
        </span>
    );
}