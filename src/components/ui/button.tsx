import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-12 items-center justify-center gap-2 whitespace-normal rounded-xl text-sm font-semibold leading-snug cursor-pointer touch-manipulation select-none transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50 disabled:cursor-not-allowed aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-glow hover:brightness-105 active:brightness-95",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-105 active:brightness-95",
        outline:
          "border border-input bg-card/40 hover:border-muted-foreground/60 hover:bg-secondary hover:text-foreground",
        secondary: "border border-border/60 bg-secondary text-secondary-foreground hover:bg-surface-hover",
        ghost: "hover:bg-secondary hover:text-foreground",
        segment: "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        selected: "bg-primary/12 text-primary ring-1 ring-primary/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-4 py-2",
        sm: "h-12 px-3 text-sm",
        lg: "h-14 px-8",
        icon: "size-12 min-w-12 shrink-0",
        "icon-sm": "size-12 min-w-12 shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
