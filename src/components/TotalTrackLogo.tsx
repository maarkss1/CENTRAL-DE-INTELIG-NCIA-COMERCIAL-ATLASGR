interface TotalTrackLogoProps {
    className?: string;
    alt?: string;
    variant?: 'wordmark' | 'symbol';
    tone?: 'auto' | 'positive' | 'negative';
}

export function TotalTrackLogo({
    className = 'h-8',
    alt = 'Total Trac',
    variant = 'wordmark',
    tone = 'auto',
}: TotalTrackLogoProps) {
    const positiveSrc = variant === 'symbol'
        ? '/brand/totaltrac/symbol-positive.png'
        : '/brand/totaltrac/wordmark-positive.png';
    const negativeSrc = variant === 'symbol'
        ? '/brand/totaltrac/symbol-negative.png'
        : '/brand/totaltrac/wordmark-negative.png';

    if (tone !== 'auto') {
        return (
            <img
                src={tone === 'negative' ? negativeSrc : positiveSrc}
                alt={alt}
                className={`object-contain ${className}`}
            />
        );
    }

    return (
        <span className={`inline-flex items-center ${className}`} role="img" aria-label={alt}>
            <img src={positiveSrc} alt="" aria-hidden="true" className="h-full w-auto object-contain dark:hidden" />
            <img src={negativeSrc} alt="" aria-hidden="true" className="hidden h-full w-auto object-contain dark:block" />
        </span>
    );
}
