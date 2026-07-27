interface TotalTrackLogoProps {
    className?: string;
    alt?: string;
}

export function TotalTrackLogo({ className = "h-8", alt = "TotalTrac Logo" }: TotalTrackLogoProps) {
    return (
        <img 
            src="/totaltrack-logo.png" 
            onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = "https://totaltrac.com.br/wp-content/uploads/2023/04/logomarca.png";
            }}
            alt={alt} 
            className={`object-contain mix-blend-multiply ${className}`} 
        />
    );
}
