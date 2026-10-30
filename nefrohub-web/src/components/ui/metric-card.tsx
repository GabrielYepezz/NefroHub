import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface MetricCardProps {
  title: string
  value: string | number
  unit?: string
  subtitle?: string
  icon?: React.ReactNode
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}

export function MetricCard({
  title,
  value,
  unit,
  subtitle,
  icon,
  variant = 'default',
  className,
}: MetricCardProps) {
  const borderTopColor = {
    default: 'border-t-muted-foreground/30',
    primary: 'border-t-primary',
    success: 'border-t-success',
    warning: 'border-t-warning',
    danger: 'border-t-destructive',
  }[variant]

  const iconBgColor = {
    default: 'bg-secondary text-muted-foreground',
    primary: 'bg-primary-light text-primary',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    danger: 'bg-destructive-bg text-destructive',
  }[variant]

  return (
    <Card className={cn('border-border card-subtle border-t-3 transition-all duration-150 hover:shadow-sm', borderTopColor, className)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          {icon && (
            <div className={cn('p-2 rounded-lg shrink-0', iconBgColor)}>
              {icon}
            </div>
          )}
        </div>

        <div className="mt-2.5 flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-clinical">
            {value}
          </span>
          {unit && (
            <span className="text-xs font-medium text-muted-foreground">
              {unit}
            </span>
          )}
        </div>

        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground leading-snug">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
