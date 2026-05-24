"use client";

import { DropdownMenu } from "radix-ui";
import * as React from "react";

export const DropdownMenuRoot = DropdownMenu.Root;
export const DropdownMenuTrigger = DropdownMenu.Trigger;
export const DropdownMenuPortal = DropdownMenu.Portal;
export const DropdownMenuSub = DropdownMenu.Sub;
export const DropdownMenuSubTrigger = DropdownMenu.SubTrigger;
export const DropdownMenuRadioGroup = DropdownMenu.RadioGroup;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>
>(({ className = "", sideOffset = 6, ...props }, ref) => (
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      ref={ref}
      sideOffset={sideOffset}
      className={[
        "z-50 min-w-[180px] overflow-hidden rounded-xl border border-white/[0.08]",
        "bg-[#111]/95 backdrop-blur-xl p-1 shadow-2xl shadow-black/60",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      ].join(" ")}
      {...props}
    />
  </DropdownMenu.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Item> & { destructive?: boolean }
>(({ className = "", destructive, ...props }, ref) => (
  <DropdownMenu.Item
    ref={ref}
    className={[
      "relative flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2",
      "text-[13px] outline-none transition-colors",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      destructive
        ? "text-red-400 focus:bg-red-500/10 focus:text-red-300"
        : "text-zinc-300 focus:bg-white/[0.07] focus:text-white",
      className,
    ].join(" ")}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Separator>
>(({ className = "", ...props }, ref) => (
  <DropdownMenu.Separator
    ref={ref}
    className={["my-1 h-px bg-white/[0.07]", className].join(" ")}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenu.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>
>(({ className = "", ...props }, ref) => (
  <DropdownMenu.Label
    ref={ref}
    className={["px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600", className].join(" ")}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";
