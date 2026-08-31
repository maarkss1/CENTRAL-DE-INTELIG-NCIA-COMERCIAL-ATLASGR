/**
 * Carousel — componente de carousel usando Embla Carousel
 *
 * Suave, acessível, sem dependências de CSS externas além das classes Tailwind.
 * Usado na Academia de Treinamentos e no OnboardingTour.
 *
 * Uso:
 *   <Carousel autoPlay={5000} showDots showArrows>
 *     <CarouselSlide>Slide 1</CarouselSlide>
 *     <CarouselSlide>Slide 2</CarouselSlide>
 *   </Carousel>
 */
import { ReactNode, useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CarouselProps {
  children: ReactNode;
  /** Intervalo de autoplay em ms. 0 = desabilitado. */
  autoPlay?: number;
  showDots?: boolean;
  showArrows?: boolean;
  loop?: boolean;
  className?: string;
  slideClassName?: string;
  /** Callback chamado ao mudar de slide. */
  onSlideChange?: (index: number) => void;
}

export function Carousel({
  children,
  autoPlay = 0,
  showDots = true,
  showArrows = true,
  loop = false,
  className = '',
  slideClassName = '',
  onSlideChange,
}: CarouselProps) {
  const plugins = autoPlay > 0 ? [Autoplay({ delay: autoPlay, stopOnInteraction: true })] : [];

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop, align: 'start', skipSnaps: false },
    plugins,
  );

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    const idx = emblaApi.selectedScrollSnap();
    setSelectedIndex(idx);
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
    onSlideChange?.(idx);
  }, [emblaApi, onSlideChange]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    onSelect();
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  return (
    <div className={`relative w-full ${className}`} aria-roledescription="carousel">
      {/* Viewport do Embla */}
      <div ref={emblaRef} className="overflow-hidden rounded-2xl">
        <div className={`flex ${slideClassName}`}>{children}</div>
      </div>

      {/* Setas de navegação */}
      {showArrows && (
        <>
          <button
            type="button"
            onClick={scrollPrev}
            disabled={!canPrev && !loop}
            aria-label="Slide anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/80 shadow-card backdrop-blur-sm transition-all
              disabled:opacity-0 disabled:pointer-events-none hover:border-brand/40 hover:text-brand"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            disabled={!canNext && !loop}
            aria-label="Próximo slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/80 shadow-card backdrop-blur-sm transition-all
              disabled:opacity-0 disabled:pointer-events-none hover:border-brand/40 hover:text-brand"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Dots de paginação */}
      {showDots && scrollSnaps.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2" role="tablist" aria-label="Slides">
          {scrollSnaps.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx === selectedIndex}
              aria-label={`Ir para slide ${idx + 1}`}
              onClick={() => scrollTo(idx)}
              className={`h-2 rounded-full transition-all duration-300
                ${idx === selectedIndex
                  ? 'w-6 bg-brand'
                  : 'w-2 bg-line hover:bg-ink-2'
                }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * CarouselSlide — wrapper obrigatório para cada slide dentro de <Carousel>.
 */
interface CarouselSlideProps {
  children: ReactNode;
  className?: string;
}

export function CarouselSlide({ children, className = '' }: CarouselSlideProps) {
  return (
    <div
      className={`min-w-0 flex-[0_0_100%] ${className}`}
      role="tabpanel"
      aria-roledescription="slide"
    >
      {children}
    </div>
  );
}
