import { useEffect } from 'react';

type KeyCombo = string;

export function useHotkeys(keyMap: Record<KeyCombo, () => void>) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const isCtrlOrCmd = event.ctrlKey || event.metaKey;

            for (const [combo, handler] of Object.entries(keyMap)) {
                const keys = combo.toLowerCase().split('+');

                const requiresCtrl = keys.includes('ctrl') || keys.includes('cmd');
                const requiresShift = keys.includes('shift');
                const requiresAlt = keys.includes('alt');

                const mainKey = keys.filter(k => !['ctrl', 'cmd', 'shift', 'alt'].includes(k))[0];

                if (
                    (requiresCtrl ? isCtrlOrCmd : !isCtrlOrCmd) &&
                    (requiresShift ? event.shiftKey : !event.shiftKey) &&
                    (requiresAlt ? event.altKey : !event.altKey) &&
                    event.key.toLowerCase() === mainKey
                ) {
                    event.preventDefault();
                    handler();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [keyMap]);
}
