const fs = require('fs');

const filePath = 'src/features/prospecting/components/prospecting-hub/OcrCapturePanel.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// The original div
const oldDiv = `<div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-line rounded-2xl p-10 text-center cursor-pointer hover:border-brand hover:bg-surface-2/50 transition-all bg-surface"
                >`;

// The accessible div
const newDiv = `<div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-line rounded-2xl p-10 text-center cursor-pointer hover:border-brand hover:bg-surface-2/50 transition-all bg-surface focus:outline-none focus:ring-2 focus:ring-brand"
                >`;

if (content.includes(oldDiv)) {
    content = content.replace(oldDiv, newDiv);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Patched successfully!');
} else {
    console.error('Target string not found in OcrCapturePanel.tsx');
}
