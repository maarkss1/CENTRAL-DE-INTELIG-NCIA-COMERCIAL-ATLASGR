interface LogoProps {
    variant?: 'default' | 'white' | 'symbol';
    className?: string;
}

export function Logo({ variant = 'default', className = "h-8" }: LogoProps) {
    const fillOrange = "#FF5618";
    const fillText = variant === 'white' ? "#FFFFFF" : "#333333";

    if (variant === 'symbol') {
        return (
            <svg viewBox="0 0 60 60" className={className} xmlns="http://www.w3.org/2000/svg">
                <polygon points="10,50 33,10 53,10 30,50" fill={fillOrange} />
                <polygon points="35,50 46.5,30 58,50" fill={fillOrange} />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 230 60" className={className} xmlns="http://www.w3.org/2000/svg">
            {/* Parallelogram */}
            <polygon points="10,50 33,10 53,10 30,50" fill={fillOrange} />
            {/* Triangle */}
            <polygon points="35,50 46.5,30 58,50" fill={fillOrange} />
            {/* Lettering */}
            <text 
                x="65" 
                y="48" 
                fontFamily="Space Grotesk, Montserrat, sans-serif" 
                fontWeight="900" 
                fontSize="42" 
                fill={fillText} 
                letterSpacing="-1.5"
            >
                AtlasGR
            </text>
        </svg>
    );
}
