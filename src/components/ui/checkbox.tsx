"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@app/lib/cn";
import { cva, type VariantProps } from "class-variance-authority";

// Define checkbox variants
const checkboxVariants = cva(
    "peer h-4 w-4 shrink-0 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
    {
        variants: {
            variant: {
                outlinePrimary:
                    "border rounded-[5px] border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
                outline:
                    "border rounded-[5px] border-input data-[state=checked]:border-primary data-[state=checked]:bg-muted data-[state=checked]:text-accent-foreground",
                outlinePrimarySquare:
                    "border rounded-[5px] border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
                outlineSquare:
                    "border rounded-[5px] border-input data-[state=checked]:border-primary data-[state=checked]:bg-muted data-[state=checked]:text-foreground"
            }
        },
        defaultVariants: {
            variant: "outlinePrimary"
        }
    }
);

interface CheckboxProps
    extends
        React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
        VariantProps<typeof checkboxVariants> {}

const Checkbox = React.forwardRef<
    React.ElementRef<typeof CheckboxPrimitive.Root>,
    CheckboxProps
>(({ className, variant, ...props }, ref) => (
    <CheckboxPrimitive.Root
        ref={ref}
        className={cn(checkboxVariants({ variant }), className)}
        {...props}
    >
        <CheckboxPrimitive.Indicator className="flex items-center justify-center">
            <Check className="h-4 w-4 text-current" />
        </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

interface CheckboxWithLabelProps extends React.ComponentPropsWithoutRef<
    typeof Checkbox
> {
    label: string;
}

const CheckboxWithLabel = React.forwardRef<
    React.ComponentRef<typeof Checkbox>,
    CheckboxWithLabelProps
>(({ className, label, id, ...props }, ref) => {
    return (
        <div className={cn("flex items-center gap-x-2", className)}>
            <Checkbox id={id} ref={ref} {...props} />
            <label
                htmlFor={id}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
                {label}
            </label>
        </div>
    );
});
CheckboxWithLabel.displayName = "CheckboxWithLabel";

export { Checkbox, CheckboxWithLabel };
