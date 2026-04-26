import React, { useRef, useEffect } from 'react';
import { Equation } from '../../hooks/useGraphingEngine';
import { textToLatex } from '../../lib/math-parser';
import { LatexRenderer } from './LatexRenderer';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Slider } from '../ui/slider';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  SlidersHorizontal,
  Circle,
  PenLine,
  Sigma,
} from 'lucide-react';

interface EquationListProps {
  equations: Equation[];
  onAdd: () => void;
  onUpdate: (id: string, text: string) => void;
  onToggleVisibility: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onUpdateVariableValue: (id: string, value: number) => void;
}

function EquationTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'parametric':
      return <PenLine className="w-3 h-3" />;
    case 'polar':
      return <Circle className="w-3 h-3" />;
    case 'implicit':
      return <Sigma className="w-3 h-3" />;
    case 'variable':
      return <SlidersHorizontal className="w-3 h-3" />;
    default:
      return null;
  }
}

function EquationCard({
  eq,
  onUpdate,
  onToggleVisibility,
  onRemove,
  onUpdateColor,
  onUpdateVariableValue,
}: {
  eq: Equation;
  onUpdate: (id: string, text: string) => void;
  onToggleVisibility: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onUpdateVariableValue: (id: string, value: number) => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isVariable = eq.parsed.type === 'variable';
  const latexStr = textToLatex(eq.text);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
    }
  }, [eq.text]);

  return (
    <div
      className="bg-card p-3 rounded-lg shadow-sm border border-border flex flex-col gap-2 transition-all hover:shadow-md group"
      style={{ borderLeftColor: eq.color, borderLeftWidth: '3px' }}
    >
      <div className="flex items-start gap-2">
        {/* Color picker */}
        <div className="relative mt-1.5 flex-shrink-0">
          <div
            className="w-5 h-5 rounded-full cursor-pointer border-2 border-card shadow-sm"
            style={{ backgroundColor: eq.color }}
          />
          <input
            type="color"
            value={eq.color}
            onChange={(e) => onUpdateColor(eq.id, e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            title="Change color"
          />
        </div>

        {/* Equation input */}
        <div className="flex-1 min-w-0">
          <textarea
            ref={inputRef}
            value={eq.text}
            onChange={(e) => onUpdate(eq.id, e.target.value)}
            placeholder="e.g. y=sin(x), x^2+y^2=25, r=cos(theta)"
            rows={1}
            className={`w-full resize-none overflow-hidden rounded-md border bg-transparent px-3 py-1.5 text-sm font-mono 
              focus:outline-none focus:ring-1 focus:ring-ring
              ${eq.error ? 'border-destructive focus:ring-destructive' : 'border-input'}`}
          />

          {/* LaTeX preview */}
          {latexStr && !eq.error && (
            <div className="mt-1 pl-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <EquationTypeIcon type={eq.parsed.type} />
              <LatexRenderer latex={latexStr} className="text-foreground" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
          {!isVariable && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggleVisibility(eq.id)}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={eq.visible ? 'Hide' : 'Show'}
            >
              {eq.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(eq.id)}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Variable slider */}
      {isVariable && eq.parsed.variableValue !== undefined && (
        <div className="pl-7 pr-2 flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground min-w-[20px]">
            {eq.parsed.variableName}
          </span>
          <Slider
            value={[eq.parsed.variableValue]}
            min={-10}
            max={10}
            step={0.1}
            onValueChange={(val) => onUpdateVariableValue(eq.id, val[0])}
            className="flex-1"
          />
          <span className="text-xs font-mono text-muted-foreground min-w-[36px] text-right">
            {eq.parsed.variableValue.toFixed(1)}
          </span>
        </div>
      )}

      {/* Error */}
      {eq.error && eq.text.trim() !== '' && (
        <div className="flex items-center gap-1 text-xs text-destructive pl-7">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate" title={eq.error}>
            {eq.error}
          </span>
        </div>
      )}
    </div>
  );
}

export function EquationList({
  equations,
  onAdd,
  onUpdate,
  onToggleVisibility,
  onRemove,
  onUpdateColor,
  onUpdateVariableValue,
}: EquationListProps) {
  return (
    <div className="flex flex-col h-full bg-secondary/30 border-r border-border w-full">
      <div className="p-4 border-b border-border flex justify-between items-center bg-card">
        <h2 className="text-base font-semibold text-foreground tracking-tight">Equations</h2>
        <Button onClick={onAdd} size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {equations.map((eq) => (
            <EquationCard
              key={eq.id}
              eq={eq}
              onUpdate={onUpdate}
              onToggleVisibility={onToggleVisibility}
              onRemove={onRemove}
              onUpdateColor={onUpdateColor}
              onUpdateVariableValue={onUpdateVariableValue}
            />
          ))}

          {equations.length === 0 && (
            <div className="text-center text-muted-foreground py-10 text-sm space-y-3">
              <p>No equations yet.</p>
              <p className="text-xs leading-relaxed">
                Try: <code className="bg-muted px-1 rounded">y = sin(x)</code>{' '}
                <code className="bg-muted px-1 rounded">x^2+y^2=25</code>{' '}
                <code className="bg-muted px-1 rounded">r = cos(3*theta)</code>{' '}
                <code className="bg-muted px-1 rounded">(cos(t), sin(t))</code>{' '}
                <code className="bg-muted px-1 rounded">a = 3</code>
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
