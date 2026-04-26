import { useRef, useEffect } from 'react';
import katex from 'katex';

interface LatexRendererProps {
  latex: string;
  className?: string;
}

export function LatexRenderer({ latex, className = '' }: LatexRendererProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!containerRef.current || !latex) return;
    try {
      katex.render(latex, containerRef.current, {
        throwOnError: false,
        displayMode: false,
        output: 'html',
      });
    } catch {
      if (containerRef.current) {
        containerRef.current.textContent = latex;
      }
    }
  }, [latex]);

  if (!latex) return null;

  return <span ref={containerRef} className={className} />;
}
