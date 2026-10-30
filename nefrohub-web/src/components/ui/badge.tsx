import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium tracking-tight transition-colors focus:outline-none select-none',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-foreground border border-border',
        primary: 'bg-primary-light text-primary border border-primary/20',
        secondary: 'bg-secondary text-muted-foreground border border-border/70',
        success: 'bg-success-bg text-success-foreground border border-success/20',
        warning: 'bg-warning-bg text-warning-foreground border border-warning/20',
        destructive: 'bg-destructive-bg text-destructive-foreground border border-destructive/20',
        info: 'bg-info-bg text-info-foreground border border-info/20',
        outline: 'border border-border text-muted-foreground bg-card',
      },
      size: {
        sm: 'text-[10px] px-2 py-0.5 font-medium',
        md: 'text-xs px-2.5 py-0.5 font-medium',
        lg: 'text-sm px-3 py-1 font-medium',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant = 'default', size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            variant === 'success' && 'bg-success',
            variant === 'warning' && 'bg-warning',
            variant === 'destructive' && 'bg-destructive',
            variant === 'primary' && 'bg-primary',
            variant === 'info' && 'bg-info',
            (!variant || variant === 'default' || variant === 'secondary' || variant === 'outline') && 'bg-muted-foreground'
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
}

export { Badge, badgeVariants }
