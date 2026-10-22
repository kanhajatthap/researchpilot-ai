'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart3, PieChart, LayoutGrid, ChevronDown, ChevronUp, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DataPoint {
  label: string;
  value: number;
  formatted?: string;
  unit?: string;
}

export interface DataVisualizerProps {
  content: string;
  className?: string;
}

const PALETTE = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-indigo-500',
];

const STROKE_PALETTE = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#f43f5e', // rose
  '#6366f1', // indigo
];

/**
 * Parses financial data points from text content or embedded ```chart JSON blocks.
 */
export function extractDataSeries(text: string): { title: string; points: DataPoint[] } | null {
  // 1. Check for explicit ```chart JSON block
  const chartBlockMatch = text.match(/```chart\s*([\s\S]*?)\s*```/i);
  if (chartBlockMatch) {
    try {
      const parsed = JSON.parse(chartBlockMatch[1]);
      if (Array.isArray(parsed.data) && parsed.data.length > 0) {
        return {
          title: parsed.title || 'Data Breakdown',
          points: parsed.data.map((d: any) => ({
            label: String(d.label || d.name),
            value: Number(d.value) || 0,
            unit: d.unit || '',
            formatted: d.formatted,
          })),
        };
      }
    } catch {
      // invalid json, fallback
    }
  }

  // 2. Intelligent pattern matching for financial/metric lists:
  // e.g. "- **Automotive sales**: $72,480 million" or "Leasing: $1,827M"
  const lines = text.split('\n');
  const foundPoints: DataPoint[] = [];

  for (const line of lines) {
    // Strip markdown formatting like **, __, bullets
    const cleanLine = line
      .replace(/[*_#`]/g, '')
      .replace(/^[\s•\-–—\d.)]+/, '')
      .trim();

    const colonIndex = cleanLine.indexOf(':');
    if (colonIndex > 0) {
      const label = cleanLine.slice(0, colonIndex).trim();
      const rest = cleanLine.slice(colonIndex + 1).trim();
      const numMatch = rest.match(
        /\$?\s*([\d,]+(?:\.\d+)?)\s*(million|billion|trillion|M|B|k|%)?/i
      );

      if (numMatch && label.length > 1 && label.length < 50) {
        const rawNum = parseFloat(numMatch[1].replace(/,/g, ''));
        const unit = numMatch[2] || 'M';
        // Exclude generic total labels from the breakdown items
        if (!label.toLowerCase().includes('total') && !isNaN(rawNum) && rawNum > 0) {
          foundPoints.push({
            label,
            value: rawNum,
            unit: unit.toUpperCase().startsWith('B') ? '$B' : '$M',
            formatted: `$${rawNum.toLocaleString()} ${unit}`,
          });
        }
      }
    }
  }

  if (foundPoints.length >= 2) {
    return {
      title: 'Financial Breakdown',
      points: foundPoints,
    };
  }

  return null;
}

export function DataVisualizer({ content, className }: DataVisualizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'donut' | 'kpi'>('bar');

  const series = useMemo(() => extractDataSeries(content), [content]);

  if (!series || series.points.length < 2) return null;

  const totalValue = series.points.reduce((acc, p) => acc + p.value, 0);

  return (
    <div className={cn('mt-2 text-xs', className)}>
      <Button
        variant='outline'
        size='xs'
        onClick={() => setIsOpen((prev) => !prev)}
        className='gap-1.5 border-border/80 bg-muted/30 text-xs font-medium hover:bg-muted/70 text-foreground'
      >
        <BarChart3 className='size-3.5 text-primary' />
        <span>{isOpen ? 'Hide Visual Chart' : `Visualize Breakdown (${series.points.length} metrics)`}</span>
        {isOpen ? <ChevronUp className='size-3' /> : <ChevronDown className='size-3' />}
      </Button>

      {isOpen && (
        <Card className='mt-2.5 overflow-hidden border-border/70 bg-card p-4 shadow-sm animate-in fade-in-50 duration-200'>
          {/* Chart Header */}
          <div className='flex items-center justify-between border-b border-border/60 pb-2.5'>
            <div>
              <h4 className='font-heading text-xs font-semibold text-foreground'>{series.title}</h4>
              <p className='text-[11px] text-muted-foreground'>
                Total: <strong className='text-foreground'>${totalValue.toLocaleString()}M</strong>
              </p>
            </div>

            <div className='flex items-center gap-1'>
              <Button
                variant={chartType === 'bar' ? 'secondary' : 'ghost'}
                size='icon-xs'
                onClick={() => setChartType('bar')}
                title='Bar Chart'
              >
                <BarChart3 className='size-3.5' />
              </Button>
              <Button
                variant={chartType === 'donut' ? 'secondary' : 'ghost'}
                size='icon-xs'
                onClick={() => setChartType('donut')}
                title='Donut Chart'
              >
                <PieChart className='size-3.5' />
              </Button>
              <Button
                variant={chartType === 'kpi' ? 'secondary' : 'ghost'}
                size='icon-xs'
                onClick={() => setChartType('kpi')}
                title='KPI Metric Cards'
              >
                <LayoutGrid className='size-3.5' />
              </Button>
            </div>
          </div>

          {/* Bar Chart View */}
          {chartType === 'bar' && (
            <div className='mt-3.5 space-y-2.5'>
              {series.points.map((point, i) => {
                const percentage = totalValue > 0 ? (point.value / totalValue) * 100 : 0;
                const colorClass = PALETTE[i % PALETTE.length];

                return (
                  <div key={point.label} className='space-y-1'>
                    <div className='flex items-center justify-between text-xs'>
                      <div className='flex items-center gap-1.5 min-w-0'>
                        <span className={cn('size-2 rounded-full shrink-0', colorClass)} />
                        <span className='truncate font-medium text-foreground'>{point.label}</span>
                      </div>
                      <div className='flex items-center gap-2 font-mono text-[11px] shrink-0'>
                        <span className='font-semibold text-foreground'>
                          ${point.value.toLocaleString()}M
                        </span>
                        <span className='text-muted-foreground'>({percentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                    {/* Progress Track */}
                    <div className='h-2 w-full overflow-hidden rounded-full bg-muted/60'>
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', colorClass)}
                        style={{ width: `${Math.min(100, Math.max(percentage, 2))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Donut Chart View */}
          {chartType === 'donut' && (
            <div className='mt-4 flex flex-col items-center justify-center gap-4 sm:flex-row'>
              {/* Circular SVG Donut */}
              <div className='relative size-32 shrink-0'>
                <svg className='size-full -rotate-90' viewBox='0 0 36 36'>
                  <circle
                    cx='18'
                    cy='18'
                    r='15.915'
                    fill='transparent'
                    stroke='currentColor'
                    strokeWidth='3.5'
                    className='text-muted/40'
                  />
                  {(() => {
                    let accumulatedOffset = 0;
                    return series.points.map((point, i) => {
                      const percentage = totalValue > 0 ? (point.value / totalValue) * 100 : 0;
                      const strokeDasharray = `${percentage} ${100 - percentage}`;
                      const strokeDashoffset = -accumulatedOffset;
                      accumulatedOffset += percentage;

                      return (
                        <circle
                          key={point.label}
                          cx='18'
                          cy='18'
                          r='15.915'
                          fill='transparent'
                          stroke={STROKE_PALETTE[i % STROKE_PALETTE.length]}
                          strokeWidth='3.5'
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className='transition-all duration-500'
                        />
                      );
                    });
                  })()}
                </svg>
                <div className='absolute inset-0 flex flex-col items-center justify-center text-center'>
                  <span className='text-[10px] text-muted-foreground uppercase font-semibold'>Total</span>
                  <span className='font-heading text-xs font-bold text-foreground'>
                    ${totalValue.toLocaleString()}M
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className='flex flex-col gap-1.5 min-w-0'>
                {series.points.map((point, i) => {
                  const percentage = totalValue > 0 ? (point.value / totalValue) * 100 : 0;
                  return (
                    <div key={point.label} className='flex items-center gap-2 text-xs'>
                      <span className={cn('size-2 rounded-full shrink-0', PALETTE[i % PALETTE.length])} />
                      <span className='truncate text-muted-foreground max-w-[140px]' title={point.label}>
                        {point.label}
                      </span>
                      <span className='font-mono font-medium text-foreground ml-auto'>
                        ${point.value.toLocaleString()}M ({percentage.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* KPI Cards Grid */}
          {chartType === 'kpi' && (
            <div className='mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-3'>
              {series.points.map((point, i) => {
                const percentage = totalValue > 0 ? (point.value / totalValue) * 100 : 0;
                return (
                  <div
                    key={point.label}
                    className='rounded-lg border border-border/70 bg-muted/20 p-2.5'
                  >
                    <div className='flex items-center gap-1.5'>
                      <span className={cn('size-1.5 rounded-full shrink-0', PALETTE[i % PALETTE.length])} />
                      <span className='truncate text-[11px] text-muted-foreground' title={point.label}>
                        {point.label}
                      </span>
                    </div>
                    <p className='mt-1 font-heading text-sm font-bold text-foreground'>
                      ${point.value.toLocaleString()}M
                    </p>
                    <span className='text-[10px] text-muted-foreground font-mono'>
                      {percentage.toFixed(1)}% of total
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
